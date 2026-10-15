// world-party.js — your hunting party and the week's goals, kept by the server (api/_world-rank.mjs): the party (the leader
// and up to three friends who accepted), its quest (500 knock-outs together this week), the weekly bounties (100 / 300 /
// 600 knock-outs) and a top-3 village's prize. The game reads who is in your party from here for the +15% XP.
// Reads: the small party view (1–2 documents) every 3 minutes while you're signed in and the page is showing, the full one
// (about 5) when the Adventure log's Daily tab or the chat's Friends tab opens, at most every 20 seconds.
//
// ctx: { T, esc, toast, post, sess(), Snd?, onChange() }
export const PARTY_READY = true;
const POLL = 180e3, FULL_TTL = 20e3;

export function createParty(ctx) {
  const { T, esc, toast, post, sess } = ctx;
  let mini = { party: null, invites: [] }, full = null, miniAt = 0, fullAt = 0, tryAt = 0, busy = false;
  const me = () => { const s = sess(); return s ? String(s.wallet).toLowerCase() : ""; };
  const changed = () => { try { ctx.onChange && ctx.onChange(); } catch { /* a repaint must not stop the party */ } };
  const take = (j) => { // the full view carries the small one inside it
    full = j; fullAt = Date.now();
    mini = { party: j.party ? { id: j.party.id, lead: j.party.lead, max: j.party.max, members: j.party.members.map((m) => ({ w: m.w, n: m.n })) } : null, invites: j.invites || [] };
  };
  async function refresh(force) {
    const w = me(); if (!w) { if (mini.party || mini.invites.length) { mini = { party: null, invites: [] }; full = null; changed(); } return; }
    if (!force && Date.now() - miniAt < 20e3) return; miniAt = Date.now();
    try { const r = await fetch("/api/social?world=party&wallet=" + w, { cache: "no-store" }); if (r.ok) { const j = await r.json(); if (JSON.stringify(j) !== JSON.stringify(mini)) { mini = j; changed(); } } } catch { /* next time */ }
  }
  async function loadFull(force) {
    const w = me(); if (!w) return null;
    if (!force && Date.now() - tryAt < FULL_TTL) return full; tryAt = Date.now(); // the log repaints often: one read per 20 s at most
    try { const r = await fetch("/api/social?world=bounty&wallet=" + w, { cache: "no-store" }); if (r.ok) { take(await r.json()); changed(); } } catch { /* the old view stays */ }
    return full;
  }
  async function act(action, body, okMsg) {
    const s = sess(); if (!s) { toast(T("Sign in with your wallet first")); return null; } if (busy) return null; busy = true;
    try {
      const r = await post({ action, ...s, ...body });
      if (!r.ok) { toast(T(r.j.error || "That didn't work")); return null; }
      take(r.j); miniAt = Date.now(); if (okMsg) toast(T(okMsg)); changed(); return r.j;
    } finally { busy = false; }
  }
  const members = () => (mini.party ? mini.party.members : []);
  const leading = () => !!mini.party && mini.party.lead === me();
  const inParty = (w) => members().some((m) => m.w === String(w || "").toLowerCase());
  const nameOf = (w, n) => n || String(w).slice(0, 6) + "…" + String(w).slice(-4);

  // ---- the party card (the chat's Friends tab) ----
  const bar = (n, of) => `<i class="wq-bar"><b style="width:${Math.min(100, (100 * n) / of)}%"></b></i>`;
  function card() {
    if (!me()) return "";
    const p = full && full.party, inv = mini.invites || [], leader = leading();
    let h = `<h3>${esc(T("Party"))}</h3>`;
    if (inv.length) h += `<ul class="wp-chat-list">${inv.map((i) => `<li><span class="wp-chat-who"><b>${esc(nameOf(i.from, i.fn))}</b><small>${esc(T("invites you to a party"))}</small></span><button type="button" class="wp-btn wp-cta" data-pa="accept" data-id="${esc(i.id)}">${esc(T("Join"))}</button><button type="button" class="wp-btn" data-pa="decline" data-id="${esc(i.id)}">${esc(T("Decline"))}</button></li>`).join("")}</ul>`;
    if (!mini.party) return h + `<p class="wp-chat-note">${esc(T("Hunt with up to three friends: +15% XP when one is near, and a shared quest each week."))}</p><button type="button" class="wp-btn wp-cta" data-pa="create">${esc(T("Start a party"))}</button>`;
    h += `<ul class="wp-chat-list">${(p ? p.members : mini.party.members).map((m) => `<li><span class="wp-chat-who"><b>${esc(nameOf(m.w, m.n))}</b><small>${m.w === mini.party.lead ? esc(T("Leader")) : ""}${p && m.k != null ? ` ${esc(T("{n} knock-outs", { n: m.k }))}` : ""}</small></span>${leader && m.w !== me() ? `<button type="button" class="wp-btn" data-pa="kick" data-w="${esc(m.w)}">${esc(T("Remove"))}</button>` : ""}</li>`).join("")}</ul>`;
    if (p) h += `<p class="wp-chat-note">${esc(T("Party quest: {n} / {m} knock-outs this week · +{a} ARCL each", { n: Math.min(p.total, p.goal), m: p.goal, a: p.arcl }))}</p>${bar(p.total, p.goal)}${p.done && !p.claimed ? `<button type="button" class="wp-btn wp-cta" data-pa="claim">${esc(T("Claim"))}</button>` : ""}`;
    return h + `<p class="wp-chat-note">${esc(leader ? T("Invite friends from the list below.") : T("The leader invites friends."))}</p><button type="button" class="wp-btn wp-danger" data-pa="leave">${esc(T("Leave the party"))}</button>`;
  }
  /// the button on a friend's row: Invite while there's room (the leader, or anyone with no party), a tag once they're in
  function rowBtn(w) {
    if (!me()) return "";
    if (inParty(w)) return `<span class="wp-chat-tag">${esc(T("In your party"))}</span>`;
    if (mini.party && (!leading() || mini.party.members.length >= mini.party.max)) return "";
    return `<button type="button" class="wp-btn" data-pa="invite" data-w="${esc(w)}">${esc(T("Invite to party"))}</button>`;
  }
  /// a start-then-invite in one tap (the profile card, a friend's row)
  async function invite(w) {
    w = String(w || "").toLowerCase();
    if (!mini.party) { if (!(await act("world-party-create", {}))) return; }
    else if (!leading()) { toast(T("Only the leader invites")); return; }
    if (await act("world-party-invite", { to: w })) toast(T("Invitation sent"));
  }
  const ACT = {
    create: () => act("world-party-create", {}, "Party started"), accept: (d) => act("world-party-accept", { id: d.id }, "You joined the party"), decline: (d) => act("world-party-decline", { id: d.id }),
    leave: () => act("world-party-leave", {}, "You left the party"), kick: (d) => act("world-party-kick", { to: d.w }), claim: () => claimed(act("world-party-claim", {})), invite: (d) => invite(d.w),
  };
  const claimed = async (p) => { const j = await p; if (j) { toast(T("+{n} ARCL", { n: j.credited || 0 })); ctx.Snd && ctx.Snd.win && ctx.Snd.win(); } return j; };
  /// a click inside the chat panel or the log: true when it was one of ours
  function click(b) {
    const d = b.dataset || {};
    if (d.pa && ACT[d.pa]) { ACT[d.pa](d); return true; }
    if (d.bk) { claimed(act("world-bounty-claim", { id: d.bk })); return true; }
    if (d.vk) { const [p, key] = d.vk.split(":"); claimed(act("world-vwin-claim", { p, key })); return true; }
    return false;
  }

  const leftTxt = (ms) => { const m = Math.max(0, Math.floor(ms / 6e4)); return m >= 1440 ? T("{d}d {h}h", { d: Math.floor(m / 1440), h: Math.floor(m / 60) % 24 }) : T("{h}h {m}m", { h: Math.floor(m / 60), m: m % 60 }); }; // time to the Monday reset
  // ---- the Adventure log's Daily tab: this week's bounties, the party quest and a village prize ----
  function bountyHTML() {
    if (!me()) return "";
    if (!full) return `<h4 class="wq-codex-sec">${esc(T("Bounties"))}</h4><p class="wr-note">${esc(T("Loading…"))}</p>`;
    const check = `<em class="ok" aria-label="${esc(T("Done"))}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></em>`;
    const row = (name, sub, n, of, btn, state) => `<li class="${state}"><div><b>${esc(name)}</b><small>${esc(sub)}</small>${bar(Math.min(n, of), of)}</div><span>${Math.min(n, of)} / ${of}</span>${btn}</li>`;
    const b = full.bounties.map((x) => row(T("Defeat {n} monsters", { n: x.kills }), T("+{n} ARCL · this week's knock-outs the server counted", { n: x.arcl }), full.kills, x.kills, x.claimed ? check : `<button type="button" data-bk="${x.id}" ${x.done ? "" : "disabled"}>${esc(T("Claim"))}</button>`, x.claimed ? "done" : x.done ? "ready" : ""));
    const p = full.party;
    if (p) b.push(row(T("Party quest"), T("{n} knock-outs together · +{a} ARCL each (add {m} yourself)", { n: p.goal, a: p.arcl, m: p.min }), p.total, p.goal, p.claimed ? check : `<button type="button" data-pa="claim" ${p.done && p.mine >= p.min ? "" : "disabled"}>${esc(T("Claim"))}</button>`, p.claimed ? "done" : p.done ? "ready" : ""));
    const prizes = (full.wins || []).filter((x) => x.rank).map((x) => `<li class="${x.claimed ? "done" : "ready"}"><div><b>${esc(x.p === "week" ? T("Top village last week: #{n}", { n: x.rank }) : T("Top village last month: #{n}", { n: x.rank }))}</b><small>${esc(T("+{n} ARCL", { n: x.prize }))}</small></div><span></span>${x.claimed ? check : `<button type="button" data-vk="${x.p}:${esc(x.key)}">${esc(T("Claim"))}</button>`}</li>`);
    return `<h4 class="wq-codex-sec">${esc(T("Bounties"))}</h4><p class="wr-note">${esc(T("Weekly goals, counted by the server from your knock-outs in the streets and hunting grounds. They start over every Monday (Seoul time)."))}${full.next > Date.now() ? ` <small class="wq-reset${full.next - Date.now() < 6 * 36e5 && (full.bounties.some((x) => x.done && !x.claimed) || (p && p.done && !p.claimed)) ? " soon" : ""}">${esc(T("Resets Monday · {t}", { t: leftTxt(full.next - Date.now()) }))}</small>` : ""}${p ? "" : ` ${esc(T("A party quest starts when you start a party in Chat → Friends."))}`}</p><ul class="wq-list">${b.join("")}${prizes.join("")}</ul>`;
  }

  setInterval(() => { if (!document.hidden && me()) refresh(); }, POLL);
  setTimeout(() => { if (me()) refresh(true); }, 4000);
  return { refresh, loadFull, card, rowBtn, invite, click, bountyHTML, members, leading, inParty, full: () => full,
    /// the wallets of your party-mates (not you), for the XP bonus and the figures on screen
    others: () => members().map((m) => m.w).filter((w) => w !== me()),
    nameOf: (w) => { const m = members().find((x) => x.w === w); return m ? m.n : ""; },
    invites: () => (mini.invites || []).length };
}
