// world-studio-hubx.js — the Creator Hub's second round (HUB 2, 2026-10-28, the owner: "…이거 빼고 다 진행하자"): a
// creator's profile page, the forum (show & tell, feedback, bugs, team up), the notification center, a game's full page
// on a computer (big header, gallery, tabs: about · ranking · comments · updates · A/B), the A/B difficulty test (two
// versions against the same 40 test players: estimate()), the weekly report card with a picture to share, the Jump
// World piece market and the partners' sponsor contests. world-studio-hub.js calls html() / fill() / act() for these
// pages; the server side is api/_world-hub.mjs (hub-*) and api/_world-studio.mjs (studio-*). No number here is made up.
import { TEMPLATES, THEMES, KNOBS, estimate, clampSpec } from "./world-studio-gen.js";

export const XTITLE = { profile: "Creator profile", forum: "Forum", inbox: "Notifications", game: "Game" };
export const XSUBS = { forum: [["show", "Show & tell"], ["help", "Feedback"], ["bugs", "Bug reports"], ["team", "Team up"]] };
const BANNERS = ["create", "community", "learn", "store", "rewards", "updates"]; // (= api/_world-hub.mjs HUB.BANNERS, the hub's Meshy banners)
const BADGE = { p100: "100 plays", p1k: "1,000 plays", p10k: "10,000 plays", l10: "10 likes", l100: "100 likes", g3: "3 games", g10: "10 games" };
const KIND = { cmt: ["chat", "{by} commented on {t}"], fan: ["users", "{by} started following you"], beat: ["trophy", "{by} took #1 on {t}"], team: ["users", "{by} joined your team on {t}"],
  reply: ["chat", "{by} replied to “{t}”"], use: ["grid", "{by} added your piece “{t}”"], note: ["mega", "{by} posted an update to {t}"], rank: ["flag", "{t} is #{n} in this week's contest"], remix: ["grid", "{by} remixed {t}"] };
const IFILT = [["all", "All"], ["cmt", "Comments"], ["fan", "Followers"], ["beat", "Records"], ["team", "Team"], ["reply", "Forum"], ["rank", "Contest"], ["remix", "Remixes"]];
const AB_K = ["speed", "walls", "gaps", "lasers", "coins"], AB_R = { speed: [1, 5], coins: [0, 5], walls: [0, 5], gaps: [0, 3], lasers: [0, 3] }; // (= world-studio-gen.js clampBase)

export function makeHubX(c) {
  const { T, esc, ic, num, ver, D } = c;
  const tag = () => String(c.wallet() || "").slice(2, 8);
  const LS = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } return v; };
  const act = async (body) => { try { const r = await c.signed(body); if (!r.ok) c.toast(esc((r.j && r.j.error) || T("Couldn't open it — try again"))); return r; } catch (e) { c.toast(esc((e && e.message) || T("Sign-in failed"))); return { ok: false, j: {} }; } };
  const drop = (re) => c.forget(re);
  const sky = (th) => `/images/studio/th/${THEMES[th] ? th : "neon"}-sky-768.webp${ver}`;
  const profUrl = (h) => `?p=profile&h=${encodeURIComponent(h)}`;
  const byLink = (h, name) => (h ? `<a href="${profUrl(h)}" data-xprof="${esc(h)}" class="sgx-by">@${esc(h)}${name && name.toLowerCase() !== h ? ` <small>${esc(name)}</small>` : ""}</a>` : `<span class="sgx-by">${esc(name || "ARCIRCLE")}</span>`);

  // ---------------- the notification center ----------------
  const inbox = async () => { const w = c.wallet(); return w ? c.get("inbox:" + w, "/api/social?world=hub-inbox&wallet=" + w, 20e3) : null; };
  /// the week's contest place of each of your games, kept on this device: a change is a notice of its own
  async function rankNotes() {
    const m = await c.mine(), w = await c.week(); if (!m || !w || !w.top) return;
    const mineIds = new Set((m.games || []).map((g) => g.id)), had = LS("arc.hub.rank") || {}, now = {}, out = LS("arc.hub.local") || [];
    w.top.forEach((x, i) => { if (mineIds.has(x.id)) now[x.id] = i + 1; });
    if (had.wk === w.week) for (const [id, n] of Object.entries(now)) if (had.r && had.r[id] !== n) { const g = (m.games || []).find((q) => q.id === id); out.unshift({ k: "r" + id + n + Date.now().toString(36), kind: "rank", t: (g && g.title) || "", n, id, at: Date.now() }); }
    LS("arc.hub.rank", { wk: w.week, r: now }); LS("arc.hub.local", out.slice(0, 20));
  }
  async function items() {
    const [r] = await Promise.all([inbox(), rankNotes().catch(() => {})]), L = [...((r && r.items) || []), ...(LS("arc.hub.local") || [])].sort((a, b) => b.at - a.at);
    const seen = Math.max((r && r.seen) || 0, Number(LS("arc.hub.lseen")) || 0); D.gm = !!(r && r.gm);
    return { L, seen, n: L.filter((x) => x.at > seen).length };
  }
  const itemText = (it) => T((KIND[it.kind] || KIND.cmt)[1], { by: it.by || T("A creator"), t: it.t || T("your game"), n: it.n || "" });
  const itemGo = (it) => (it.kind === "reply" ? `data-xpost="${esc(it.id)}"` : it.kind === "use" ? `data-go="store" data-s="pieces"` : it.kind === "fan" ? `data-go="analytics"` : it.id ? `data-xgame="${esc(it.id)}"` : `data-go="creations"`);
  const itemRow = (it, seen) => `<button type="button" class="sgh-pi sgx-ni${it.at > seen ? " new" : ""}" ${itemGo(it)}><i class="sgx-nic k-${esc(it.kind)}">${ic((KIND[it.kind] || KIND.cmt)[0], "sm")}</i><span><b>${esc(itemText(it))}</b><small>${esc(c.ago(it.at))}</small></span></button>`;
  async function markSeen() { LS("arc.hub.lseen", Date.now()); D.inboxN = 0; if (c.sess()) { try { await c.signed({ action: "world-hub-seen" }); } catch { /* the device's mark stays */ } drop(/^inbox:/); } }
  async function inboxHtml() {
    if (!c.wallet()) return c.signCard("Sign in to see your notifications", "Comments on your games, new followers, a record beaten, a team invite answered, replies in the forum and contest places — all in one place.");
    const { L, seen } = await items(), f = D.nf || "all", V = L.filter((x) => f === "all" || x.kind === f || (f === "team" && x.kind === "note"));
    const chips = `<div class="sgh-chips">${IFILT.map(([k, l]) => `<button type="button" data-xnf="${k}" class="${f === k ? "on" : ""}">${esc(T(l))}${k === "all" ? "" : ` <em>${L.filter((x) => x.kind === k).length}</em>`}</button>`).join("")}</div>`;
    setTimeout(markSeen, 1200);
    return `<div class="sgh-fbar">${chips}<span class="sgh-sp"></span><button type="button" class="sgh-btn sm" data-xseen>${ic("check", "sm")} ${esc(T("Mark all as read"))}</button></div>
      ${V.length ? `<div class="sgx-nlist">${V.map((x) => itemRow(x, seen)).join("")}</div>` : c.empty("bell", "Nothing here yet", "When someone comments, follows you, beats your record or joins your team, it shows here.")}`;
  }
  /// the bell's top rows (world-studio-hub.js bell())
  async function bellRows() { if (!c.wallet()) return ""; const { L, seen, n } = await items(); D.inboxN = n; return L.length ? `<h5 class="sgx-bh">${esc(T("For you"))}</h5>${L.slice(0, 5).map((x) => itemRow(x, seen)).join("")}<a class="sgh-pall" href="?p=inbox" data-go="inbox">${esc(T("All notifications"))}</a>` : ""; }
  async function unread() { if (!c.wallet()) return 0; const { n } = await items(); D.inboxN = n; return n; }

  // ---------------- a creator's profile ----------------
  async function profileHtml() {
    let h = String(D.q.h || "").toLowerCase(); const myH = await c.handle(); if (!h) h = myH;
    if (!h) return c.wallet() ? `${c.empty("users", "Pick a creator ID first", "Your profile lives at your ID: arcircle.app/game/@ID. Pick one in My games.", `<button type="button" class="sgh-btn pri" data-ws="mine">${esc(T("Pick a creator ID"))}</button>`)}` : c.signCard("Sign in to see your profile", "Your profile shows your games, badges, followers and your titles from ARCIRCLE WORLD.");
    const [cr, pr] = await Promise.all([c.get("cr:" + h, "/api/social?world=studio-creator&h=" + encodeURIComponent(h)), c.get("pr:" + h, "/api/social?world=hub-profile&h=" + encodeURIComponent(h), 30e3)]);
    if (cr && cr.moved) { c.go("profile", "", false, { h: cr.moved }); return ""; }
    if (!cr || !cr.creator) return c.empty("search", "No such creator", "That ID isn't anyone's yet — check the spelling.");
    const C = cr.creator, G = cr.games || [], P = (pr && pr.profile) || { bio: "", banner: 0, pins: [], links: [] }, Wd = pr && pr.world, own = !!myH && myH === h;
    let fans = 0, fol = false; if (G[0] && !C.off) { const j = await c.get("gm:" + G[0].id + ":" + c.wallet(), "/api/social?world=studio-game&id=" + G[0].id + (c.wallet() ? "&me=" + c.wallet() : ""), 30e3); if (j && j.game) { fans = j.game.fans || 0; fol = !!j.game.fol; } }
    const plays = G.reduce((a, g) => a + (g.plays || 0), 0), likes = G.reduce((a, g) => a + (g.likes || 0), 0), lv = C.lv || 1, pins = P.pins.map((id) => G.find((g) => g.id === id)).filter(Boolean);
    const badges = [...(C.badges || []).map((b) => `<span class="sgx-badge">${ic("star", "xs")} ${esc(T(BADGE[b] || b))}</span>`), ...(Wd && Wd.rookie ? [`<span class="sgx-badge gold">${ic("trophy", "xs")} ${esc(T("Rookie Creator"))}</span>`] : []), ...(C.off ? [`<span class="sgx-badge gold">${esc(T("Official"))}</span>`] : [])];
    const links = (P.links || []).map((u) => { const host = u.replace(/^https:\/\/(www\.)?/, "").split("/")[0]; return `<a class="sgx-link" href="${esc(u)}" target="_blank" rel="noopener nofollow">${ic("link", "xs")} ${esc(host)}</a>`; }).join("");
    const btns = own ? `<button type="button" class="sgh-btn" data-xedit>${ic("edit", "sm")} ${esc(T("Edit profile"))}</button>` : C.off ? "" : `<button type="button" class="sgh-btn ${fol ? "" : "pri"}" data-xfollow="${esc((G[0] || {}).id || "")}" data-on="${fol ? 0 : 1}">${ic(fol ? "check" : "plus", "sm")} ${esc(T(fol ? "Following" : "Follow"))}</button>`;
    const world = Wd ? `<section class="sgh-panel rv sgx-world"><div class="sgx-wicon">${ic("globe")}</div><div><h3>${esc(T("In ARCIRCLE WORLD"))}</h3><p>${esc(T("Lv {n} adventurer", { n: Wd.lv || 1 }))} · ${esc(T("{n} achievements", { n: (Wd.ach || []).length }))}${Wd.rookie ? " · " + esc(T("Rookie Creator")) : ""}</p></div><a class="sgh-btn sm" href="/play">${ic("globe", "sm")} ${esc(T("Play ARCIRCLE WORLD"))}</a></section>` : "";
    const edit = own && D.xedit ? editForm(P, G) : "";
    return `<section class="sgx-pban rv in" style="--art:url('${c.hubArt(BANNERS[P.banner] || "create")}')"><span class="sgx-pav" style="--h:${(parseInt(String(C.h || h).split("").reduce((a, ch) => a + ch.charCodeAt(0), 0)) * 37) % 360}">${C.off ? "∞" : esc((C.name || h).slice(0, 1).toUpperCase())}</span></section>
      <div class="sgx-phead"><div class="sgx-pname"><h2>${esc(C.name || h)}</h2><span>@${esc(h)}</span><em class="sgx-lv">${esc(T("Creator Lv {n}", { n: lv }))}</em></div><span class="sgh-sp"></span>${btns}<button type="button" class="sgh-btn" data-copy="${esc(location.origin + "/game/@" + h)}">${ic("link", "sm")} ${esc(T("Copy link"))}</button><a class="sgh-btn" href="/game/@${esc(h)}" target="_blank" rel="noopener">${ic("ext", "sm")} ${esc(T("Web page"))}</a></div>
      ${P.bio ? `<p class="sgx-bio">${esc(P.bio)}</p>` : own ? `<p class="sgx-bio dim">${esc(T("Add a line about yourself and the games you make."))}</p>` : ""}${links ? `<p class="sgx-links">${links}</p>` : ""}
      <div class="sgh-kpis sm">${c.kpiT("rocket", G.length, "Games")}${c.kpiT("play", num(plays), "Plays")}${c.kpiT("heart", num(likes), "Likes")}${c.kpiT("users", num(fans), "Followers")}${c.kpiT("trophy", "Lv " + lv, "Creator level", C.next > C.from ? Math.round(((C.xp - C.from) / (C.next - C.from)) * 100) : 100)}</div>
      ${badges.length ? `<p class="sgx-badges">${badges.join("")}</p>` : ""}${edit}${world}
      ${pins.length ? c.sec("Pinned", `<div class="sgh-grid g3">${pins.map((g) => c.gameCard({ ...g, byName: C.name })).join("")}</div>`) : ""}
      ${c.sec(own ? "Your games" : "Games", G.length ? `<div class="sgh-grid g4">${G.map((g) => c.gameCard({ ...g, byName: C.name })).join("")}</div>` : `<p class="sgh-fine">${esc(T("No published games yet."))}</p>`)}
      ${P.team ? `<p class="sgh-fine">${ic("users", "xs")} ${esc(T("Builds {n} games with a team", { n: P.team }))}</p>` : ""}`;
  }
  function editForm(P, G) {
    return `<section class="sgh-panel sgx-edit" data-xform="profile"><h3>${esc(T("Edit profile"))}</h3>
      <h4>${esc(T("Banner"))}</h4><div class="sgx-bans">${BANNERS.map((k, i) => `<label><input type="radio" name="xban" value="${i}"${(P.banner || 0) === i ? " checked" : ""}><span style="background-image:url('${c.hubArt(k, 768)}')"></span></label>`).join("")}</div>
      <h4>${esc(T("About you"))}</h4><textarea name="bio" maxlength="160" rows="3" placeholder="${esc(T("A line about you and your games"))}">${esc(P.bio || "")}</textarea>
      <h4>${esc(T("Pinned games (up to 3)"))}</h4><div class="sgx-pins">${G.map((g) => `<label><input type="checkbox" name="pin" value="${esc(g.id)}"${(P.pins || []).includes(g.id) ? " checked" : ""}><span>${esc(g.title)}</span></label>`).join("") || `<small class="sgh-fine">${esc(T("Publish a game to pin it."))}</small>`}</div>
      <h4>${esc(T("Links (X, Telegram, Discord, YouTube, GitHub)"))}</h4>${[0, 1, 2].map((i) => `<input name="link" type="url" placeholder="https://x.com/…" value="${esc((P.links || [])[i] || "")}">`).join("")}
      <div class="sgh-cta"><button type="button" class="sgh-btn pri" data-xsave>${ic("check", "sm")} ${esc(T("Save"))}</button><button type="button" class="sgh-btn" data-xedit>${esc(T("Cancel"))}</button></div></section>`;
  }
  async function saveProfile(box) {
    const v = (n) => [...box.querySelectorAll(`[name="${n}"]`)], pins = v("pin").filter((x) => x.checked).map((x) => x.value).slice(0, 3);
    const r = await act({ action: "world-hub-profile", bio: (box.querySelector("[name=bio]") || {}).value || "", banner: Number((v("xban").find((x) => x.checked) || {}).value || 0), pins, links: v("link").map((x) => x.value.trim()).filter(Boolean) });
    if (r.ok) { c.toast("✓ " + esc(T("Profile saved"))); D.xedit = false; drop(/^pr:/); c.paint(); }
  }

  // ---------------- the forum ----------------
  const board = () => (XSUBS.forum.some(([k]) => k === c.sub()) ? c.sub() : "show");
  async function forumHtml() {
    if (D.q.t) return threadHtml(D.q.t);
    const b = board(), r = await c.get("bd:" + b, "/api/social?world=hub-board&b=" + b, 10e3), L = (r && r.posts) || [];
    const intro = { show: "Show the game you made, a level you're proud of, a trick you found.", help: "Ask others to play your game and tell you what to change.", bugs: "Something broken in the Studio? Tell us what you did and what happened.", team: "Looking for a partner to build with? Say what you want to make." }[b];
    return `${c.head("community", T((XSUBS.forum.find(([k]) => k === b) || [])[1] || "Forum"), intro, `<button type="button" class="sgh-btn pri" data-xnew>${ic("plus")} ${esc(T("New post"))}</button>`)}
      <div class="sgh-chips sgx-bchips">${XSUBS.forum.map(([k, l]) => `<button type="button" data-go="forum" data-s="${k}" class="${b === k ? "on" : ""}">${esc(T(l))}</button>`).join("")}</div>
      ${D.xnew ? await newPostForm(b) : ""}
      ${L.length ? `<ul class="sgx-posts">${L.map((p) => `<li><button type="button" data-xpost="${esc(p.id)}"><span class="sgx-pav sm" style="--h:${(parseInt(p.by || "0", 16) || 0) % 360}">${esc((p.name || "?").slice(0, 1).toUpperCase())}</span><span class="sgx-pt"><b>${p.gm ? `<em class="sgx-gm">GM</em> ` : ""}${esc(p.title)}</b><small>${esc(p.name || T("A creator"))} · ${esc(c.ago(p.up || p.at))}${p.game ? " · 🎮" : ""}</small></span><i>${ic("chat", "xs")} ${p.n}</i><i>${ic("heart", "xs")} ${p.likes}</i></button></li>`).join("")}</ul>`
        : c.empty("chat", "No posts here yet", "Start the first one — say hello and share what you're making.", `<button type="button" class="sgh-btn pri" data-xnew>${ic("plus")} ${esc(T("New post"))}</button>`)}`;
  }
  async function newPostForm(b) {
    if (!c.wallet()) return c.signCard("Sign in to post", "Posts carry your name from ARCIRCLE WORLD. Signing in is free.");
    const m = await c.mine(), G = ((m && m.games) || []).filter((g) => g.pub);
    return `<section class="sgh-panel sgx-edit" data-xform="post"><h3>${esc(T("New post"))}</h3>
      <label class="sgh-sel"><small>${esc(T("Board"))}</small><select name="b">${XSUBS.forum.map(([k, l]) => `<option value="${k}"${k === b ? " selected" : ""}>${esc(T(l))}</option>`).join("")}</select></label>
      <input name="title" maxlength="80" placeholder="${esc(T("Title"))}"><textarea name="t" maxlength="1200" rows="5" placeholder="${esc(T("What would you like to say?"))}"></textarea>
      ${G.length ? `<label class="sgh-sel"><small>${esc(T("Attach a game"))}</small><select name="game"><option value="">—</option>${G.map((g) => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join("")}</select></label>` : ""}
      <div class="sgh-cta"><button type="button" class="sgh-btn pri" data-xpostsend>${ic("check", "sm")} ${esc(T("Post"))}</button><button type="button" class="sgh-btn" data-xnew>${esc(T("Cancel"))}</button></div></section>`;
  }
  async function threadHtml(id) {
    const r = await c.get("po:" + id, "/api/social?world=hub-post&id=" + encodeURIComponent(id), 5e3); if (!r || !r.post) return c.empty("chat", "This post is gone", "Its writer or a GM removed it.", `<button type="button" class="sgh-btn" data-go="forum">${esc(T("Back to the forum"))}</button>`);
    const p = r.post, me = tag(), A = p.game ? await c.arcade() : [], g = p.game ? A.find((x) => x.id === p.game) : null, mineP = !!me && p.by === me;
    const rep = (x) => `<li class="${x.op ? "op" : ""}"><span class="sgx-pav sm" style="--h:${(parseInt(x.by || "0", 16) || 0) % 360}">${esc((x.name || "?").slice(0, 1).toUpperCase())}</span><div><b>${x.gm ? `<em class="sgx-gm">GM</em> ` : ""}${esc(x.name || T("A creator"))}${x.op ? ` <em class="sgx-op">${esc(T("Author"))}</em>` : ""}</b><small>${esc(c.ago(x.at))}</small><p>${esc(x.t)}</p></div>${me && (x.by === me || D.gm) ? `<button type="button" class="sgh-ib" data-xdel="${esc(id)}" data-k="${esc(x.k)}" aria-label="${esc(T("Delete"))}">${ic("close", "sm")}</button>` : ""}</li>`;
    return `<a class="sgh-more sgx-back" href="?p=forum&s=${p.b}" data-go="forum" data-s="${p.b}">${ic("right", "sm")} ${esc(T((XSUBS.forum.find(([k]) => k === p.b) || [])[1] || "Forum"))}</a>
      <article class="sgh-panel sgx-thread"><div class="sgx-th"><span class="sgx-pav" style="--h:${(parseInt(p.by || "0", 16) || 0) % 360}">${esc((p.name || "?").slice(0, 1).toUpperCase())}</span><div><h2>${p.gm ? `<em class="sgx-gm">GM</em> ` : ""}${esc(p.title)}</h2><small>${esc(p.name || T("A creator"))} · ${esc(c.ago(p.at))}</small></div></div>
        <p class="sgx-body">${esc(p.t)}</p>${g ? `<div class="sgx-att">${c.gameCard(g, { row: 1 })}</div>` : ""}
        <div class="sgh-cta"><button type="button" class="sgh-btn" data-xlike="${esc(id)}">${ic("heart", "sm")} ${p.likes}</button><button type="button" class="sgh-btn" data-copy="${esc(location.origin + "/studio?p=forum&t=" + id)}">${ic("link", "sm")} ${esc(T("Copy link"))}</button>${mineP || (me && D.gm) ? `<button type="button" class="sgh-btn" data-xdel="${esc(id)}">${ic("close", "sm")} ${esc(T("Delete"))}</button>` : ""}</div></article>
      ${c.sec("Replies", `<ul class="sgx-reps">${(r.replies || []).map(rep).join("") || `<li class="none"><p class="sgh-fine">${esc(T("No replies yet — be the first."))}</p></li>`}</ul>
        ${c.wallet() ? `<div class="sgx-rbox" data-xform="reply"><textarea name="t" maxlength="400" rows="2" placeholder="${esc(T("Write a reply"))}"></textarea><button type="button" class="sgh-btn pri" data-xreply="${esc(id)}">${esc(T("Reply"))}</button></div>` : `<button type="button" class="sgh-btn blue" data-signin>${ic("wallet")} ${esc(T("Sign in to reply"))}</button>`}`)}`;
  }

  // ---------------- a game's full page ----------------
  const GTABS = [["about", "About"], ["rank", "Ranking"], ["cmts", "Comments"], ["notes", "Updates"], ["tree", "Remix tree"], ["ab", "A/B test"]];
  /// the header straight away from what the card knew (the card → page morph needs it on the first frame)
  function gameHead(g) {
    return `<section class="sgx-ghero${g.tmp ? " tmp" : ""}" style="--art:url('${esc(c.cover(g))}')"><div class="sgx-gbg"></div><img class="sgx-gcov" src="${esc(c.cover(g))}" alt="" width="640" height="366" onerror="this.src='${c.art(g.tpl, 768)}'">
      <div class="sgx-ginfo"><span class="sgh-chip">${esc(c.tname(g.tpl))}${g.theme ? " · " + esc(c.thname(g.theme)) : ""}</span><h1>${esc(g.title || T("Untitled"))}</h1><div class="sgx-gby" data-xgby>${esc(g.byName || "ARCIRCLE")}</div>
        <div class="sgh-gm big"><i>${ic("play", "xs")} ${num(g.plays)} ${esc(T("Plays"))}</i><i>${ic("heart", "xs")} ${num(g.likes)} ${esc(T("Likes"))}</i>${g.now ? `<i class="nowc"><b class="sgx-pulse"></b>${g.now} ${esc(T("playing"))}</i>` : ""}</div>
        <div class="sgh-cta"><button type="button" class="sgh-btn pri big" data-play="${esc(g.id)}">${ic("play")} ${esc(T("Play here"))}</button><a class="sgh-btn big" href="/play?sg=${encodeURIComponent(g.id)}">${ic("globe")} ${esc(T("Play in ARCIRCLE WORLD"))}</a></div>
        <div class="sgh-shrow" data-xgbtn></div></div></section>`;
  }
  function gameShell() { const id = D.q.id, g = (D.cards && D.cards[id]) || { id, title: "", tpl: "runner", tmp: 1 }; return `${gameHead(g)}<div data-fill="x-game">${c.skel(3)}</div>`; }
  async function gameBody(el) {
    const id = D.q.id, [A, m, jg] = await Promise.all([c.arcade(), c.wallet() ? c.mine() : null, c.get("gm:" + id + ":" + c.wallet(), "/api/social?world=studio-game&id=" + encodeURIComponent(id) + (c.wallet() ? "&me=" + c.wallet() : ""), 30e3)]);
    const J = jg && jg.game, mg = m && [...(m.games || []), ...(m.shared || [])].find((x) => x.id === id), g = { ...(A.find((x) => x.id === id) || {}), ...(mg || {}), ...(J || {}) };
    if (!J && !mg) { el.innerHTML = c.empty("search", "No such game", "It may have been taken down by its maker."); return; }
    D.cards = { ...(D.cards || {}), [id]: g }; const own = !!(m && (m.games || []).some((x) => x.id === id)), team = !!(mg && mg.co), page = J && J.h && J.slug ? `/game/@${J.h}/${J.slug}` : "";
    const hero = el.parentNode.querySelector(".sgx-ghero"); if (hero && hero.classList.contains("tmp")) hero.outerHTML = gameHead(g); else if (hero) { const gm = hero.querySelector(".sgh-gm"); if (gm) gm.outerHTML = gameHead(g).match(/<div class="sgh-gm big">.*?<\/div>/s)[0]; }
    const by = el.parentNode.querySelector("[data-xgby]"); if (by) by.innerHTML = byLink(J && J.h, g.byName) + (J && !J.off && J.fans != null ? ` · ${esc(T("{n} followers", { n: num(J.fans) }))}` : "") + (mg && mg.co && mg.co.name ? ` · ${ic("users", "xs")} ${esc(mg.co.owner || "")}${mg.co.name ? ", " + esc(mg.co.name) : ""}` : "");
    const bt = el.parentNode.querySelector("[data-xgbtn]"); if (bt) bt.innerHTML = `${own || team ? `<button type="button" class="sgh-btn" data-edit="${esc(id)}">${ic("edit", "sm")} ${esc(T("Edit"))}</button>` : `<button type="button" class="sgh-btn" data-remix="${esc(id)}">${ic("remix", "sm")} ${esc(T("Remix it"))}</button>`}${J && !J.off && !own && J.fans != null ? `<button type="button" class="sgh-btn" data-xfollow="${esc(id)}" data-on="${J.fol ? 0 : 1}">${ic(J.fol ? "check" : "plus", "sm")} ${esc(T(J.fol ? "Following" : "Follow"))}</button>` : ""}${page ? `<a class="sgh-btn" href="${page}" target="_blank" rel="noopener">${ic("ext", "sm")} ${esc(T("Game page"))}</a>` : ""}<button type="button" class="sgh-btn" data-copy="${esc(location.origin + (page || "/play?sg=" + encodeURIComponent(id)))}">${ic("link", "sm")} ${esc(T("Copy link"))}</button>${own ? `<button type="button" class="sgh-btn" data-go="analytics" data-s="games" data-ag="${esc(id)}">${ic("chart", "sm")} ${esc(T("Analytics"))}</button>` : ""}`;
    const tabs = GTABS.filter(([k]) => k !== "ab" || own), tb = tabs.some(([k]) => k === D.gtab) ? D.gtab : "about";
    const gal = [c.cover(g), c.art(g.tpl, 768), sky(g.theme)].filter((u, i, a) => a.indexOf(u) === i);
    el.innerHTML = `<div class="sgx-gal rv in">${gal.map((u, i) => `<button type="button" data-ximg="${esc(u)}" style="--d:${i * 70}ms"><img src="${esc(u)}" alt="" loading="lazy" width="320" height="183" onerror="this.closest('button').remove()"></button>`).join("")}</div>
      <nav class="sgx-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-xgtab="${k}" class="${tb === k ? "on" : ""}">${esc(T(l))}</button>`).join("")}</nav><div class="sgx-tab" data-xgpane>${await gameTab(tb, g, J, own, team)}</div>`;
  }
  async function gameTab(tb, g, J, own, team) {
    const id = g.id, sp = (J && J.spec) || null;
    if (tb === "about") { const K = KNOBS[g.tpl] || {}, R = sp ? AB_K.filter((k) => K[k] && sp[k] != null) : [];
      return `<div class="sgh-two sgx-about"><div><h4>${esc(T("How to play"))}</h4><p>${esc(T(c.TDESC[g.tpl] || ""))}</p>${R.length ? `<h4>${esc(T("Tuned like this"))}</h4><ul class="sgx-knobs">${R.map((k) => `<li><span>${esc(T(K[k]))}</span><i><em style="width:${Math.round(((sp[k] - AB_R[k][0]) / (AB_R[k][1] - AB_R[k][0])) * 100)}%"></em></i><b>${sp[k]}</b></li>`).join("")}</ul>` : ""}</div>
        <div><h4>${esc(T("About this game"))}</h4><ul class="sgx-facts"><li><span>${esc(T("Template"))}</span><b>${esc(c.tname(g.tpl))}</b></li><li><span>${esc(T("Theme"))}</span><b>${esc(c.thname(g.theme))}</b></li>${g.at ? `<li><span>${esc(T("Updated"))}</span><b>${esc(new Date(g.at).toISOString().slice(0, 10))}</b></li>` : ""}${g.remixes ? `<li><span>${esc(T("Remixes"))}</span><b>${g.remixes}</b></li>` : ""}${g.from ? `<li><span>${esc(T("Remixed from"))}</span><b><a href="?p=game&id=${esc(g.from)}" data-xgame="${esc(g.from)}">${esc(T("the original"))}</a></b></li>` : ""}</ul>
        ${Object.keys(g.rx || {}).length ? `<h4>${esc(T("Reactions"))}</h4><p class="sgh-rx">${Object.entries(g.rx).map(([k, n]) => `<span>${esc(k)} <b>${n}</b></span>`).join("")}</p>` : ""}</div></div>`; }
    if (tb === "rank") { const B = (J && J.best) || []; return B.length ? `<ol class="sgh-board">${B.map((x, i) => `<li class="${i < 3 ? "top" : ""}"><i>${["🥇", "🥈", "🥉"][i] || i + 1}</i><b>${esc(x.name || T("A player"))}</b><span>${x.gh ? "👻" : ""}</span><em></em><strong>${num(x.score)}</strong></li>`).join("")}</ol>` : `<p class="sgh-fine">${esc(T("No runs yet — play it and take #1."))}</p>`; }
    if (tb === "cmts") { const r = await c.get("cm:" + id, "/api/social?world=studio-comments&id=" + id, 10e3), L = (r && r.comments) || [];
      return `${c.wallet() ? `<div class="sgx-rbox" data-xform="cmt"><textarea name="t" maxlength="200" rows="2" placeholder="${esc(T("Say something about this game"))}"></textarea><button type="button" class="sgh-btn pri" data-xcmt="${esc(id)}">${esc(T("Post"))}</button></div>` : `<button type="button" class="sgh-btn blue" data-signin>${ic("wallet")} ${esc(T("Sign in to comment"))}</button>`}
        <ul class="sgx-reps">${L.map((x) => `<li class="${x.maker ? "op" : ""}"><span class="sgx-pav sm" style="--h:${(parseInt(x.by || "0", 16) || 0) % 360}">${esc((x.name || "?").slice(0, 1).toUpperCase())}</span><div><b>${esc(x.name || T("A player"))}${x.maker ? ` <em class="sgx-op">${esc(T("Maker"))}</em>` : ""}</b><small>${esc(c.ago(x.at))}</small><p>${esc(x.t)}</p></div></li>`).join("") || `<li class="none"><p class="sgh-fine">${esc(T("No comments yet."))}</p></li>`}</ul>`; }
    if (tb === "notes") { const r = await c.get("nt:" + id, "/api/social?world=hub-notes&id=" + id, 15e3), N = (r && r.notes) || [], V = (own && (D.cards[id] || {}).vers) || [];
      return `${own || team ? `<div class="sgx-rbox" data-xform="note"><textarea name="t" maxlength="280" rows="2" placeholder="${esc(T("What changed? Your followers see it in their feed."))}"></textarea><button type="button" class="sgh-btn pri" data-xnote="${esc(id)}">${ic("mega", "sm")} ${esc(T("Post update"))}</button></div>` : ""}
        <ol class="sgx-notes">${N.map((n) => `<li><time>${esc(new Date(n.at).toISOString().slice(0, 10))}</time><p>${esc(n.t)}</p><small>${esc(n.name || "")}</small></li>`).join("") || `<li class="none"><p class="sgh-fine">${esc(T("No updates posted yet."))}</p></li>`}</ol>
        ${V.length ? `<h4>${esc(T("Saved versions"))}</h4><ul class="sgx-facts">${V.map((v, i) => `<li><span>${esc(T("Version {n}", { n: V.length - i }))}</span><b>${esc(new Date(v.at).toISOString().replace("T", " ").slice(0, 16))}</b></li>`).join("")}</ul><p class="sgh-fine">${esc(T("Bring an older version back from the Studio's Versions list."))}</p>` : ""}`; }
    if (tb === "tree") { const r = await c.get("rt:" + id, "/api/social?world=studio-remixes&id=" + id, 30e3), ch = (r && r.chain) || [], K = (r && r.kids) || []; // (OBBY 2026-10-28: where it came from and what came of it)
      const node = (x, cls) => `<li class="${cls}"><a href="?p=game&id=${esc(x.id)}" data-xgame="${esc(x.id)}"><b>${esc(x.title || T("A game"))}</b><small>${esc(T("by {n}", { n: x.byName || T("A creator") }))}${x.plays ? " · ▶ " + num(x.plays) : ""}</small></a></li>`;
      return `<p class="sgh-fine">${esc(T("A remix keeps its original maker's name, and every play of a remix counts for the original too — the record a share of remix earnings will be read from."))}</p>
        <ol class="sgx-tree">${ch.slice().reverse().map((x, i) => node(x, i === 0 ? "root" : "up")).join("")}<li class="me"><b>${esc(g.title || "")}</b><small>${esc(T("this game"))}${r && r.rx ? " · " + esc(T("{n} plays through its remixes", { n: num(r.rx) })) : ""}</small></li></ol>
        ${K.length ? `<h4>${esc(T("Remixes of this game"))}</h4><ul class="sgx-tree kids">${K.map((x) => node(x, "kid")).join("")}</ul>` : `<p class="sgh-fine">${esc(T("No remixes yet — remix it and make it yours."))}</p>`}`; }
    if (tb === "ab") return sp ? abHtml(id, sp) : `<p class="sgh-fine">${esc(T("Couldn't open it — try again"))}</p>`;
    return "";
  }

  // ---------------- the A/B difficulty test ----------------
  const ABS = {}; // (id → B's knobs)
  function abCol(sp, lab, cls) {
    const E = estimate(sp), mx = Math.max(1, ...E.fails), clr = Math.round(E.clear * 100);
    return `<div class="sgx-abc ${cls}"><h4>${esc(T(lab))}</h4><div class="sgx-abn"><b data-count="${clr}">${clr}</b><small>% ${esc(T("clear"))}</small></div><p class="sgx-stars">${"★".repeat(E.stars)}<span>${"★".repeat(5 - E.stars)}</span></p>
      <div class="sgh-heat">${E.fails.map((n) => `<i style="--k:${n / mx}"></i>`).join("")}</div><div class="sgh-cx"><span>${esc(T("Start"))}</span><span>${esc(T("Finish"))}</span></div></div>`;
  }
  function abHtml(id, sp0) {
    const sp = clampSpec(sp0), K = KNOBS[sp.tpl] || {}, keys = AB_K.filter((k) => K[k]), B = (ABS[id] = ABS[id] || Object.fromEntries(keys.map((k) => [k, sp[k]]))), spB = clampSpec({ ...sp, ...B });
    const a = estimate(sp).clear, b = estimate(spB).clear, d = Math.round((b - a) * 100);
    return `<div class="sgx-ab" data-xab="${esc(id)}"><p class="sgh-fine">${esc(T("Both versions are played by the same 40 test players. Move B's sliders and compare where runs end."))}${sp.build ? " " + esc(T("This level is built by hand: the sliders change only what isn't placed by hand.")) : ""}</p>
      <div class="sgx-abg">${abCol(sp, "A · now", "a")}<div class="sgx-abm"><span class="${d > 0 ? "up" : d < 0 ? "dn" : ""}">${d > 0 ? "+" : ""}${d}%</span><small>${esc(T(d > 0 ? "B is easier" : d < 0 ? "B is harder" : "The same"))}</small></div>${abCol(spB, "B · try", "b")}</div>
      <div class="sgx-absl">${keys.map((k) => `<label><span>${esc(T(K[k]))}</span><input type="range" min="${AB_R[k][0]}" max="${AB_R[k][1]}" step="1" value="${B[k]}" data-xabk="${k}"><b>${B[k]}</b>${B[k] !== sp[k] ? `<em>${esc(T("was {n}", { n: sp[k] }))}</em>` : ""}</label>`).join("")}</div>
      <div class="sgh-cta"><button type="button" class="sgh-btn pri" data-xabuse="${esc(id)}"${keys.every((k) => B[k] === sp[k]) ? " disabled" : ""}>${ic("check", "sm")} ${esc(T("Use version B"))}</button><button type="button" class="sgh-btn" data-xabreset="${esc(id)}">${esc(T("Reset B"))}</button></div></div>`;
  }
  async function abPage() {
    if (!c.wallet()) return c.signCard("Sign in to test your games", "Compare two versions of a game with the same 40 test players before you change it.");
    const m = await c.mine(), G = [...((m && m.games) || [])]; if (!G.length) return c.empty("chart", "No games yet", "Make a game and test two versions of it here.", `<button type="button" class="sgh-btn pri" data-make>${ic("plus")} ${esc(T("Create a game"))}</button>`);
    const id = G.some((g) => g.id === D.abg) ? D.abg : G[0].id, j = await c.get("gm:" + id + ":" + c.wallet(), "/api/social?world=studio-game&id=" + id + "&me=" + c.wallet(), 30e3), sp = j && j.game && j.game.spec;
    return `<div class="sgh-fbar"><label class="sgh-sel"><small>${esc(T("Game"))}</small><select data-xabg>${G.map((g) => `<option value="${esc(g.id)}"${g.id === id ? " selected" : ""}>${esc(g.title)}</option>`).join("")}</select></label></div><section class="sgh-panel rv in">${sp ? abHtml(id, sp) : `<p class="sgh-fine">${esc(T("Couldn't open it — try again"))}</p>`}</section>`;
  }
  async function abUse(id) {
    const j = await c.get("gm:" + id + ":" + c.wallet(), "/api/social?world=studio-game&id=" + id + "&me=" + c.wallet(), 30e3), sp = j && j.game && j.game.spec; if (!sp || !ABS[id]) return;
    const r = await act({ action: "world-studio-save", id, spec: clampSpec({ ...sp, ...ABS[id] }) }); if (r.ok) { c.toast("✓ " + esc(T("Version B is the game now — the old one is in Versions"))); delete ABS[id]; drop(/^(gm:|mine)/); c.paint(); }
  }

  // ---------------- the weekly report card ----------------
  async function reportData() {
    const m = await c.mine(); if (!m) return null; const G = (m.games || []).filter((g) => g.pub), now = Date.now() + 9 * 3600e3;
    const days = [...Array(14)].map((_, i) => new Date(now - (13 - i) * 86400e3).toISOString().slice(0, 10)), per = (g, a, b) => days.slice(a, b).reduce((s, d) => s + ((g.dl || {})[d] || 0), 0);
    const tw = G.reduce((s, g) => s + per(g, 7, 14), 0), lw = G.reduce((s, g) => s + per(g, 0, 7), 0), best = [...G].sort((a, b) => per(b, 7, 14) - per(a, 7, 14))[0];
    const runs = G.reduce((s, g) => s + ((g.stats || {}).runs || 0), 0), clears = G.reduce((s, g) => s + ((g.stats || {}).clears || 0), 0), lv = c.LV(G.reduce((s, g) => s + (g.plays || 0), 0), G.reduce((s, g) => s + (g.likes || 0), 0), G.length);
    return { G, days, tw, lw, d: lw ? Math.round(((tw - lw) / lw) * 100) : tw ? 100 : 0, likes: G.reduce((s, g) => s + (g.likes || 0), 0), fans: m.fans || 0, best, bestN: best ? per(best, 7, 14) : 0, clear: runs ? Math.round((clears / runs) * 100) : null, lv: lv.lv, from: days[7], to: days[13] };
  }
  async function reportHtml() {
    if (!c.wallet()) return c.signCard("Sign in to see your week", "A card with your week as a creator: plays by others, likes, followers and your best game — ready to share.");
    const R = await reportData(); if (!R || !R.G.length) return c.empty("chart", "No published games yet", "Publish a game: next week this card shows how it did.", `<button type="button" class="sgh-btn pri" data-make>${ic("plus")} ${esc(T("Create a game"))}</button>`);
    D.rep = R; const h = await c.handle();
    return `<section class="sgx-rep rv in" style="--art:url('${R.best ? esc(c.cover(R.best)) : c.hubArt("analytics", 768)}')"><div class="sgx-rbg"></div>
      <header><span class="sgh-kick">${ic("chart", "sm")} ${esc(T("Weekly creator report"))}</span><time>${esc(R.from)} – ${esc(R.to)}</time></header>
      <h2>${esc(h ? "@" + h : T("My week in ARCIRCLE Studio"))}</h2>
      <div class="sgx-rnums"><div><b data-count="${R.tw}">${num(R.tw)}</b><small>${esc(T("Plays by others"))}</small><em class="${R.d >= 0 ? "up" : "dn"}">${R.d >= 0 ? "▲" : "▼"} ${Math.abs(R.d)}%</em></div><div><b data-count="${R.likes}">${num(R.likes)}</b><small>${esc(T("Likes"))}</small></div><div><b data-count="${R.fans}">${num(R.fans)}</b><small>${esc(T("Followers"))}</small></div><div><b>Lv ${R.lv}</b><small>${esc(T("Creator level"))}</small></div></div>
      ${R.best && R.bestN ? `<div class="sgx-rbest"><img src="${esc(c.cover(R.best))}" alt="" width="160" height="92"><span><small>${esc(T("Game of the week"))}</small><b>${esc(R.best.title)}</b><i>▶ ${num(R.bestN)} ${esc(T("this week"))}</i></span></div>` : `<p class="sgh-fine">${esc(T("No plays by others this week yet — share a link to get the first ones."))}</p>`}
      ${R.clear != null ? `<p class="sgx-rclear">${esc(T("Clear rate"))} <b>${R.clear}%</b></p>` : ""}</section>
      <div class="sgh-cta"><button type="button" class="sgh-btn pri" data-xrep="save">${ic("arrowd", "sm")} ${esc(T("Save picture"))}</button>${navigator.share ? `<button type="button" class="sgh-btn" data-xrep="share">${ic("ext", "sm")} ${esc(T("Share"))}</button>` : ""}<button type="button" class="sgh-btn" data-xrep="text">${ic("link", "sm")} ${esc(T("Copy text"))}</button></div>`;
  }
  /// the card as a 1200×630 picture (for X / Telegram), drawn on a canvas — the best game's cover when it loads
  async function reportPic() {
    const R = D.rep; if (!R) return null; const h = await c.handle(), cv = document.createElement("canvas"); cv.width = 1200; cv.height = 630; const g = cv.getContext("2d");
    const img = (src) => new Promise((ok) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
    const bg = g.createLinearGradient(0, 0, 1200, 630); bg.addColorStop(0, "#0b1416"); bg.addColorStop(1, "#11121c"); g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
    const cov = R.best ? await img(c.cover(R.best)) : null; if (cov) { const k = Math.max(700 / cov.width, 630 / cov.height), w = cov.width * k, hh = cov.height * k; g.save(); g.beginPath(); g.rect(500, 0, 700, 630); g.clip(); g.globalAlpha = 0.28; g.drawImage(cov, 500 + (700 - w) / 2, (630 - hh) / 2, w, hh); g.restore(); const f = g.createLinearGradient(500, 0, 1200, 0); f.addColorStop(0, "#0b1416"); f.addColorStop(1, "rgba(11,20,22,0)"); g.fillStyle = f; g.fillRect(500, 0, 700, 630); }
    g.fillStyle = "#4fe3c1"; g.font = "800 26px Sora, sans-serif"; g.fillText(T("Weekly creator report").toUpperCase(), 64, 86); g.fillStyle = "#aeb7c1"; g.font = "600 22px Sora, sans-serif"; g.fillText(`${R.from} – ${R.to}`, 64, 122);
    g.fillStyle = "#fff"; g.font = "900 64px 'Exo 2', Sora, sans-serif"; g.fillText(h ? "@" + h : "ARCIRCLE Studio", 64, 206);
    [[num(R.tw), T("Plays by others"), (R.d >= 0 ? "▲ " : "▼ ") + Math.abs(R.d) + "%"], [num(R.likes), T("Likes")], [num(R.fans), T("Followers")], ["Lv " + R.lv, T("Creator level")]].forEach(([v, l, x], i) => {
      const X = 64 + i * 270; g.fillStyle = "#fff"; g.font = "900 68px 'Exo 2', Sora, sans-serif"; g.fillText(String(v), X, 330); g.fillStyle = "#aeb7c1"; g.font = "600 22px Sora, sans-serif"; g.fillText(l, X, 366); if (x) { g.fillStyle = R.d >= 0 ? "#4fe3c1" : "#ff5d6c"; g.font = "800 22px Sora, sans-serif"; g.fillText(x, X, 400); } });
    if (R.best && R.bestN) { if (cov) g.drawImage(cov, 64, 440, 192, 110); g.fillStyle = "#e6c36a"; g.font = "800 20px Sora, sans-serif"; g.fillText(T("Game of the week"), 280, 476); g.fillStyle = "#fff"; g.font = "800 36px Sora, sans-serif"; g.fillText(String(R.best.title).slice(0, 28), 280, 520); g.fillStyle = "#aeb7c1"; g.font = "600 22px Sora, sans-serif"; g.fillText("▶ " + num(R.bestN), 280, 552); }
    g.fillStyle = "#76818d"; g.font = "700 22px Sora, sans-serif"; g.textAlign = "right"; g.fillText("arcircle.app/studio", 1136, 590); g.textAlign = "left";
    return new Promise((ok) => { try { cv.toBlob((b) => ok(b), "image/png"); } catch { ok(null); } });
  }
  async function reportAct(k) {
    const R = D.rep; if (!R) return; const h = await c.handle(), txt = `${T("My week in ARCIRCLE Studio")}${h ? " (@" + h + ")" : ""}: ▶ ${R.tw} · ♥ ${R.likes} · ${T("{n} followers", { n: R.fans })}${R.best && R.bestN ? " · " + R.best.title : ""}\n${location.origin}/${h ? "game/@" + h : "studio"}`;
    if (k === "text") { try { await navigator.clipboard.writeText(txt); c.toast("🔗 " + esc(T("Copied"))); } catch { c.toast(esc(txt)); } return; }
    const b = await reportPic(); if (!b) { c.toast(esc(T("Couldn't open it — try again"))); return; } const f = new File([b], "arcircle-week.png", { type: "image/png" });
    if (k === "share" && navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], text: txt }); } catch { /* closed */ } return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "arcircle-week.png"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  // ---------------- the piece market (Jump World) ----------------
  const PCOL = (k) => { let h = 0; for (const ch of String(k)) h = (h * 31 + ch.charCodeAt(0)) % 360; return `hsl(${h} 70% 58%)`; };
  async function piecesHtml() {
    const r = await c.get("pcs", "/api/social?world=hub-pieces", 30e3), L = [...((r && r.list) || [])].sort(D.ps === "new" ? (a, b) => b.at - a.at : (a, b) => (b.uses || 0) - (a.uses || 0) || b.at - a.at);
    return `${c.head("store", "Pieces for Jump World", "Ready-made parts of levels other creators shared — add one to your ⭐ My pieces and drop it into your level.")}
      <div class="sgh-fbar"><div class="sgh-chips"><button type="button" data-xps="top" class="${D.ps !== "new" ? "on" : ""}">${esc(T("Most used"))}</button><button type="button" data-xps="new" class="${D.ps === "new" ? "on" : ""}">${esc(T("Newest"))}</button></div><span class="sgh-sp"></span><button type="button" class="sgh-btn" data-use="jump">${ic("plus", "sm")} ${esc(T("Open the Jump World builder"))}</button></div>
      ${L.length ? `<div class="sgh-grid g4">${L.map((p) => `<article class="sgx-pc"><canvas width="160" height="100" data-xpiece="${esc(p.id)}"></canvas><b>${esc(p.name)}</b><small>${esc(p.by || T("A creator"))} · ${p.w}×${p.h}</small><span class="sgh-gm"><i>${ic("check", "xs")} ${esc(T("{n} uses", { n: p.uses || 0 }))}</i><i>${esc(c.ago(p.at))}</i></span><button type="button" class="sgh-btn sm" data-xpuse="${esc(p.id)}">${ic("plus", "sm")} ${esc(T("Add to My pieces"))}</button></article>`).join("")}</div>`
        : c.empty("grid", "No pieces shared yet", "In the Jump World builder, save a piece to ⭐ My pieces and press ⇪ to share it here.")}
      <p class="sgh-fine">${ic("check", "xs")} ${esc(T("To share yours: in the Jump World builder, save a part to ⭐ My pieces, then press ⇪ on it."))}</p>`;
  }
  const pcache = {};
  async function piece(id) { if (!pcache[id]) pcache[id] = fetch("/api/social?world=hub-piece&id=" + encodeURIComponent(id), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => (j && j.piece) || null).catch(() => null); return pcache[id]; }
  function drawPieces(root) {
    root.querySelectorAll("canvas[data-xpiece]").forEach(async (cv) => { const p = await piece(cv.dataset.xpiece); if (!p || !cv.isConnected) return; const g = cv.getContext("2d"), s = Math.min(cv.width / (p.w + 1), cv.height / (p.h + 1)), ox = (cv.width - p.w * s) / 2, oy = (cv.height - p.h * s) / 2;
      g.fillStyle = "#0f1317"; g.fillRect(0, 0, cv.width, cv.height); for (const [x, y, k] of p.cells) { g.fillStyle = PCOL(k); g.fillRect(ox + x * s + 0.5, oy + (p.h - 1 - y) * s + 0.5, s - 1, s - 1); } });
  }
  async function usePiece(id) {
    const p = await piece(id); if (!p) { c.toast(esc(T("Couldn't open it — try again"))); return; }
    const L = (LS("arc.studio.jpf") || []).filter((q) => q && Array.isArray(q.c)); L.push({ name: String(p.name).slice(0, 30), c: p.cells.map((x) => (x[3] ? [x[0], x[1], x[2], 1] : [x[0], x[1], x[2]])) }); LS("arc.studio.jpf", L.slice(-8));
    if (c.sess()) { try { await c.signed({ action: "world-hub-piece-use", id }); drop(/^pcs$/); } catch { /* counted next time */ } }
    c.toast("⭐ " + esc(T("Added — find it in the Jump World builder's ⭐ My pieces")));
  }

  // ---------------- G2/G4 (2026-10-28): the prefab market — parts of 3D games (a boss with its health, attacks, reward and
  // rules, a house, a cave …), each with its licence; free ones install for anyone with the maker's name, paid ones for ARCL
  // (80 % to the maker after 14 days, 20 % to the platform: api/_world-studiox.mjs, api/_world-market.mjs paySale)
  const LIC = { "cc-by": ["Free · credit", "Anyone may use and remix it; the creator's name stays on it."], remix: ["Remix · share", "Use and remix inside ARCIRCLE; a remix that sells shares 25 % of its creator share with the original."], personal: ["Personal use", "Use in your own games only — it can't be shared again or listed."] };
  const PKN = { boss: "Boss", enemy: "Enemy", building: "Building", device: "Device", terrain: "Terrain", set: "Set" };
  async function prefabsHtml() {
    const w = c.wallet(), r = await c.get("pfs:" + (D.pfs || "top") + ":" + (D.pfk || "") + ":" + w, `/api/social?world=studio-prefabs&sort=${D.pfs === "new" ? "new" : "top"}${D.pfk ? "&k=" + D.pfk : ""}${w ? "&wallet=" + w : ""}`, 20e3), L = (r && r.items) || [], own = new Set((r && r.owned) || []);
    const card = (p) => { const L2 = LIC[p.lic] || LIC["cc-by"], m = p.meta || {}; return `<article class="sgh-card sgx-pf"><span class="sgh-kick">${esc(T(PKN[p.k] || p.k))}</span><h3>${esc(p.n)}</h3>
      <small>${esc(T("by {n}", { n: p.by }))}${p.orig ? " · " + esc(T("based on {n}'s", { n: p.orig.name })) : ""}</small>
      <span class="sgh-gm"><i>${m.pieces || 0} ${esc(T("pieces"))}</i>${m.hp ? `<i>❤️ ${m.hp}</i>` : ""}${m.reward ? `<i>🪙 ${m.reward}</i>` : ""}${m.rules ? `<i>⚙️ ${m.rules}</i>` : ""}${m.tracks ? `<i>▶ ${m.tracks}</i>` : ""}<i>⬇ ${p.uses || 0}</i></span>
      <p class="sgx-lic lic-${esc(p.lic)}"><b>${esc(T(L2[0]))}</b> ${esc(T(L2[1]))}</p>
      <div class="sgh-cta"><button type="button" class="sgh-btn ${p.price && !own.has(p.id) ? "pri" : ""}" data-xpf="${esc(p.id)}" data-price="${p.price || 0}">${p.price ? (own.has(p.id) ? "✓ " + esc(T("Owned")) + " · " + esc(T("Add to my library")) : `${ic("plus", "sm")} ${esc(T("Buy for {p} ARCL", { p: p.price.toLocaleString() }))}`) : `${ic("plus", "sm")} ${esc(T("Get it free"))}`}</button></div></article>`; };
    return `${c.head("store", "Prefabs for 3D games", "Parts other creators saved once — a boss with its health, attacks and reward, a house, a cave — ready to drop into any Obby World game.")}
      <div class="sgh-fbar"><div class="sgh-chips"><button type="button" data-xpfs="top" class="${D.pfs !== "new" ? "on" : ""}">${esc(T("Most used"))}</button><button type="button" data-xpfs="new" class="${D.pfs === "new" ? "on" : ""}">${esc(T("Newest"))}</button></div>
        <div class="sgh-chips">${[["", "All"], ...Object.entries(PKN)].map(([k, n]) => `<button type="button" data-xpfk="${k}" class="${(D.pfk || "") === k ? "on" : ""}">${esc(T(n))}</button>`).join("")}</div><span class="sgh-sp"></span><button type="button" class="sgh-btn" data-use="obby">${ic("plus", "sm")} ${esc(T("Open the 3D editor"))}</button></div>
      ${L.length ? `<div class="sgh-grid g3">${L.map(card).join("")}</div>` : c.empty("grid", "No prefabs shared yet", "In the 3D editor's Scene tab, save a group as a prefab (🧩) and tick 'Share it on the creators' market'.")}
      <p class="sgh-fine">${ic("check", "xs")} ${esc(T("Prices are in ARCL, the game's points. 80 % goes to the creator (it waits 14 days), 20 % to the platform. Only the share paid with purchased ARCL can later be settled by the creator; ARCL spent in the game and the $ARCIRCLE exchange are separate policies."))}</p>`;
  }
  async function getPrefab(b) {
    const id = b.dataset.xpf, price = +b.dataset.price || 0;
    if (price && !/Owned/.test(b.textContent) && !(await c.confirm(T("Buy this prefab for {p} ARCL?", { p: price.toLocaleString() })))) return;
    b.disabled = true; const r = await act(price ? { action: "world-studio-prefab-buy", id, expectedPrice: price } : { action: "world-studio-prefab-get", id }); b.disabled = false; if (!r.ok) return;
    const P = r.j.prefab, L = (LS("arc.studio.pf2") || []).filter((x) => x && x.id !== P.id); LS("arc.studio.pf2", [{ ...P.pf, id: P.id, lic: P.lic, by: P.by }, ...L].slice(0, 30)); drop(/^pfs:/);
    c.toast("🧩 " + esc(T("Added — it's in the 3D editor's Scene tab under Mine"))); c.paint();
  }

  // ---------------- sponsor contests ----------------
  const sponsors = () => c.get("sps", "/api/social?world=hub-sponsors", 60e3);
  const sponsorCard = (s) => `<article class="sgh-card rv sgx-sp" style="--art:url('${c.art(TEMPLATES[s.tpl] ? s.tpl : "runner")}')"><span class="sgh-kick">${ic("trophy", "sm")} ${esc(T("Sponsor contest"))}${s.partner ? " · " + esc(s.partner) : ""}</span><h3>${esc(s.title)}</h3>${s.prize ? `<em class="sgh-usd">${esc(T("Prize"))}: ${esc(s.prize)}</em>` : ""}<p>${esc(TEMPLATES[s.tpl] ? T("Make a {t} game and publish it before the end.", { t: c.tname(s.tpl) }) : T("Publish a game before the end."))}</p><small class="sgh-left">${ic("clock", "xs")} ${esc(c.left(s.ends))}</small>
      <div class="sgh-cta">${TEMPLATES[s.tpl] ? `<button type="button" class="sgh-btn pri" data-use="${esc(s.tpl)}">${ic("plus")} ${esc(T("Enter"))}</button>` : `<button type="button" class="sgh-btn pri" data-make>${ic("plus")} ${esc(T("Enter"))}</button>`}${s.url ? `<a class="sgh-btn" href="${esc(s.url)}" target="_blank" rel="noopener nofollow">${ic("ext", "sm")} ${esc(T("Rules and partner"))}</a>` : ""}${D.gm ? `<button type="button" class="sgh-btn sm" data-xspoff="${esc(s.id)}">${ic("close", "sm")} GM</button>` : ""}</div></article>`;
  async function sponsorHtml() {
    const [r] = await Promise.all([sponsors(), unread().catch(() => 0)]), L = (r && r.list) || [];
    const gmForm = D.gm ? `<section class="sgh-panel sgx-edit" data-xform="sponsor"><h3>GM · ${esc(T("New sponsor contest"))}</h3><input name="title" maxlength="60" placeholder="${esc(T("Title"))}"><input name="partner" maxlength="30" placeholder="${esc(T("Partner"))}"><input name="prize" maxlength="60" placeholder="${esc(T("Prize (as the partner gives it)"))}">
      <label class="sgh-sel"><small>${esc(T("Template"))}</small><select name="tpl"><option value="">${esc(T("Any"))}</option>${Object.keys(TEMPLATES).filter((k) => TEMPLATES[k].open).map((k) => `<option value="${k}">${esc(c.tname(k))}</option>`).join("")}</select></label><label class="sgh-sel"><small>${esc(T("Ends"))}</small><input name="ends" type="date"></label><input name="url" type="url" placeholder="https://…">
      <div class="sgh-cta"><button type="button" class="sgh-btn pri" data-xspsave>${esc(T("Save"))}</button></div></section>` : "";
    return `${L.length ? `<div class="sgh-two sgx-sps">${L.map(sponsorCard).join("")}</div>` : c.empty("trophy", "No sponsor contest right now", "Partners' contests show here with their prize and rules — check back soon, and enter the weekly contest meanwhile.", `<button type="button" class="sgh-btn" data-go="community" data-s="contest">${ic("trophy", "sm")} ${esc(T("Weekly contest"))}</button>`)}
      <p class="sgh-fine">${ic("check", "xs")} ${esc(T("A sponsor contest is set by a GM with a partner; the partner gives its prize as its rules say."))}</p>${gmForm}`;
  }
  async function sponsorSave(box) {
    const v = (n) => ((box.querySelector(`[name="${n}"]`) || {}).value || "").trim(), d = v("ends"), ends = d ? Date.parse(d + "T23:59:00+09:00") : 0;
    const r = await act({ action: "world-hub-sponsor", title: v("title"), partner: v("partner"), prize: v("prize"), tpl: v("tpl"), ends, url: v("url") }); if (r.ok) { c.toast("✓ " + esc(T("Saved"))); drop(/^sps$/); c.paint(); }
  }

  // ---------------- what the hub asks of this module ----------------
  const has = (page, sub) => !!XTITLE[page] || (page === "analytics" && (sub === "report" || sub === "ab")) || (page === "store" && (sub === "pieces" || sub === "prefabs")) || (page === "community" && sub === "sponsor");
  function html(page, sub) {
    if (page === "game") return gameShell();
    const k = page === "analytics" ? sub : page === "store" ? sub : page === "community" ? "sponsor" : page;
    return `${page === "analytics" ? c.head("analytics", sub === "ab" ? "A/B difficulty test" : "Weekly report", sub === "ab" ? "Two versions of your game against the same 40 test players." : "Your week as a creator, ready to share.") : page === "community" ? c.head("community", "Sponsor contests", "Partners' contests with their own prizes.") : ""}<div data-fill="x-${k}">${c.skel(page === "inbox" || page === "forum" ? 2 : 4)}</div>`;
  }
  async function fill(page, sub, root, stale) {
    const k = page === "analytics" ? sub : page === "store" ? sub : page === "community" ? "sponsor" : page, el = root.querySelector(`[data-fill="x-${k}"]`); if (!el) return;
    if (page === "game") { await gameBody(el); return; }
    const h = await ({ profile: profileHtml, forum: forumHtml, inbox: inboxHtml, report: reportHtml, ab: abPage, pieces: piecesHtml, prefabs: prefabsHtml, sponsor: sponsorHtml }[k] || (async () => ""))();
    if (stale() || !el.isConnected) return; el.innerHTML = h; if (k === "pieces") drawPieces(el); if (k === "report") c.countUp(el);
  }
  const val = (b, sel) => { const box = b.closest("[data-xform]") || b.closest("section,div"); return ((box && box.querySelector(sel)) || {}).value || ""; };
  async function onAct(b) {
    const d = b.dataset;
    if (d.xgame) { c.openGame(d.xgame); return true; }
    if (d.xprof) { c.go("profile", "", true, { h: d.xprof }); return true; }
    if (d.xpost) { c.go("forum", "", true, { t: d.xpost }); return true; }
    if (d.xnf) { D.nf = d.xnf; c.paint(); return true; }
    if (b.hasAttribute("data-xseen")) { await markSeen(); c.paint(); return true; }
    if (b.hasAttribute("data-xedit")) { D.xedit = !D.xedit; c.paint(); return true; }
    if (b.hasAttribute("data-xsave")) { await saveProfile(b.closest("[data-xform]")); return true; }
    if (b.hasAttribute("data-xnew")) { D.xnew = !D.xnew; c.paint(); return true; }
    if (b.hasAttribute("data-xpostsend")) { const box = b.closest("[data-xform]"), v = (n) => ((box.querySelector(`[name="${n}"]`) || {}).value || "").trim();
      b.disabled = true; const r = await act({ action: "world-hub-post", b: v("b"), title: v("title"), t: v("t"), game: v("game") }); b.disabled = false; if (r.ok) { D.xnew = false; drop(/^bd:/); c.go("forum", v("b"), true, { t: r.j.id }); } return true; }
    if (d.xreply) { const t = val(b, "textarea").trim(); if (!t) return true; b.disabled = true; const r = await act({ action: "world-hub-reply", id: d.xreply, t }); b.disabled = false; if (r.ok) { drop(/^(po:|bd:)/); c.paint(); } return true; }
    if (d.xlike) { const r = await act({ action: "world-hub-like", id: d.xlike }); if (r.ok) { b.innerHTML = `${ic("heart", "sm")} ${r.j.likes}`; b.classList.add("on"); if (r.j.already) c.toast(esc(T("You liked this already"))); drop(/^(po:|bd:)/); } return true; }
    if (d.xdel) { if (!(await c.ask(T(d.k ? "Delete this reply?" : "Delete this post?")))) return true; const r = await act({ action: "world-hub-del", id: d.xdel, ...(d.k ? { k: d.k } : {}) }); if (r.ok) { drop(/^(po:|bd:)/); if (d.k) c.paint(); else c.go("forum", "", true); } return true; }
    if (d.xfollow != null) { if (!d.xfollow) return true; const on = d.on === "1", r = await act({ action: "world-studio-follow", id: d.xfollow, on }); if (r.ok) { c.toast(esc(T(on ? "Following — their new games show in your feed" : "Unfollowed"))); drop(/^(gm:|cr:|feed)/); c.paint(); } return true; }
    if (d.xgtab) { D.gtab = d.xgtab; const p = document.querySelector("[data-xgpane]"); b.parentNode.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); if (p) { p.classList.add("swap"); const id = D.q.id, A = await c.arcade(), m = c.wallet() ? await c.mine() : null, j = await c.get("gm:" + id + ":" + c.wallet(), "/api/social?world=studio-game&id=" + id + (c.wallet() ? "&me=" + c.wallet() : ""), 30e3), mg = m && [...(m.games || []), ...(m.shared || [])].find((x) => x.id === id), g = { ...(A.find((x) => x.id === id) || {}), ...(mg || {}), ...((j && j.game) || {}) }, own = !!(m && (m.games || []).some((x) => x.id === id));
      p.innerHTML = await gameTab(d.xgtab, g, j && j.game, own, !!(mg && mg.co)); requestAnimationFrame(() => p.classList.remove("swap")); } return true; }
    if (d.ximg) { c.lightbox(d.ximg); return true; }
    if (d.xcmt) { const t = val(b, "textarea").trim(); if (!t) return true; b.disabled = true; const r = await act({ action: "world-studio-comment", id: d.xcmt, t }); b.disabled = false; if (r.ok) { drop(/^cm:/); D.gtab = "cmts"; const p = document.querySelector("[data-xgpane]"); if (p) p.innerHTML = await gameTab("cmts", { id: d.xcmt }, null, false, false); } return true; }
    if (d.xnote) { const t = val(b, "textarea").trim(); if (t.length < 3) return true; b.disabled = true; const r = await act({ action: "world-hub-note", id: d.xnote, t }); b.disabled = false; if (r.ok) { c.toast("📣 " + esc(T("Posted — your followers see it in their feed"))); drop(/^nt:/); const p = document.querySelector("[data-xgpane]"); if (p) p.innerHTML = await gameTab("notes", { id: d.xnote }, null, true, false); } return true; }
    if (d.xabuse) { await abUse(d.xabuse); return true; }
    if (d.xabreset) { delete ABS[d.xabreset]; redrawAb(d.xabreset); return true; }
    if (d.xrep) { await reportAct(d.xrep); return true; }
    if (d.xps) { D.ps = d.xps; c.paint(); return true; }
    if (d.xpuse) { await usePiece(d.xpuse); return true; }
    if (d.xpf) { await getPrefab(b); return true; } if (d.xpfs) { D.pfs = d.xpfs; c.paint(); return true; } if (d.xpfk != null) { D.pfk = d.xpfk; c.paint(); return true; }
    if (b.hasAttribute("data-xspsave")) { await sponsorSave(b.closest("[data-xform]")); return true; }
    if (d.xspoff) { const r = await act({ action: "world-hub-sponsor", id: d.xspoff, off: true }); if (r.ok) { drop(/^sps$/); c.paint(); } return true; }
    return false;
  }
  async function redrawAb(id) { const box = document.querySelector(`[data-xab="${id}"]`); if (!box) return; const j = await c.get("gm:" + id + ":" + c.wallet(), "/api/social?world=studio-game&id=" + id + "&me=" + c.wallet(), 30e3); if (j && j.game && j.game.spec) { const fresh = document.createElement("div"); fresh.innerHTML = abHtml(id, j.game.spec); box.replaceWith(fresh.firstElementChild); } }
  let abT = 0;
  function onInput(t) {
    if (t.matches("[data-xabk]")) { const box = t.closest("[data-xab]"), id = box.dataset.xab; ABS[id] = { ...(ABS[id] || {}), [t.dataset.xabk]: Number(t.value) }; const lab = t.parentNode.querySelector("b"); if (lab) lab.textContent = t.value; clearTimeout(abT); abT = setTimeout(() => redrawAb(id), 120); return true; }
    if (t.matches("[data-xabg]")) { D.abg = t.value; c.paint(); return true; }
    return false;
  }
  return { has, html, fill, act: onAct, onInput, bellRows, unread, seen: markSeen, XTITLE, XSUBS, gameHead };
}
