// world-inbox.js — the inbox (the bell next to the bag): gifts other players sent you, new stamps on your island and
// friends who are playing right now, in one place. Gifts are potions or scrap from another player's own bag, five a
// day (api/_world-social.mjs); never ARCL.
//
// ctx: { T, esc, post, sess, toast, Snd, rpg(), island, ghosts(), goIsland(o), goNear(x, z), openProfile(w), inHub(),
//        bookNew() }
const GIFT_LINE = { hp: ["{n} health potion", "{n} health potions"], sp: ["{n} mana potion", "{n} mana potions"], scrap: ["{n} scrap", "{n} scrap"] };

export function createInbox(ctx) {
  const { T, esc } = ctx;
  const $ = (id) => document.getElementById(id);
  let gifts = 0, open = false, el = null, pollAt = 0, seenFr = null, keep = false;
  const giftText = (g) => T(GIFT_LINE[g.kind] ? GIFT_LINE[g.kind][g.n === 1 ? 0 : 1] : "{n}", { n: g.n });

  // the bell in the top bar, with a count of what's waiting
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "wp-btn wp-icon wp-inbox-btn"; btn.id = "wp-inbox-btn"; btn.title = T("Inbox"); btn.setAttribute("aria-haspopup", "dialog");
  btn.innerHTML = `<svg class="hi" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="hiBellA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7a0"/><stop offset="1" stop-color="#f0a12a"/></linearGradient></defs><path d="M16 3.5a2 2 0 0 1 2 2v.6a8 8 0 0 1 6 7.7v5.5l2.6 3.6a1 1 0 0 1-.8 1.6H6.2a1 1 0 0 1-.8-1.6L8 19.3v-5.5a8 8 0 0 1 6-7.7v-.6a2 2 0 0 1 2-2z" fill="url(#hiBellA)"/><path d="M12.5 26.5a3.5 3.5 0 0 0 7 0z" fill="#c9771a"/><path d="M11 12.5a5 5 0 0 1 3.5-3.6" stroke="#fff" stroke-opacity=".8" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg><span class="wp-sr">${esc(T("Inbox"))}</span>`;
  const bag = $("wp-vil-btn") || $("wp-bag-btn"); if (bag && bag.parentNode) bag.parentNode.insertBefore(btn, bag.nextSibling);
  btn.addEventListener("click", () => (open ? hide() : show()));

  const friendsOn = () => { const g = ctx.ghosts(); return g ? g.named().filter((w) => w.wallet && ctx.island.isFriend(w.wallet)) : []; };
  function paintDot() {
    const n = gifts + (ctx.bookNew() || 0) + friendsOn().length;
    btn.dataset.dot = n ? String(Math.min(n, 99)) : "";
    if (ctx.onDot) ctx.onDot(n);
  }
  async function poll(force) {
    const s = ctx.sess();
    if (!s || (!force && Date.now() - pollAt < 60e3)) { if (!s) gifts = 0; friends(); paintDot(); if (open && !keep) paint(); return; }
    pollAt = Date.now();
    try { const r = await fetch("/api/social?world=gifts&wallet=" + s.wallet); gifts = r.ok ? ((await r.json()).n || 0) : gifts; } catch { /* next time */ }
    friends(); paintDot(); if (open && !keep) paint();
  }
  // a friend just came into town: one line in the toast, once each (not for those already here when you arrived)
  function friends() {
    const now = friendsOn();
    if (seenFr) { const fresh = now.filter((w) => !seenFr.has(w.wallet)); if (fresh.length) ctx.toast(T("Your friend is playing now: {x}", { x: fresh.map((w) => w.name).slice(0, 2).join(", ") })); }
    seenFr = new Set(now.map((w) => w.wallet));
  }

  function paint() {
    if (!el) return;
    const s = ctx.sess(), fr = friendsOn(), book = ctx.bookNew() || 0;
    el.innerHTML = `<div class="wp-inbox-card"><button type="button" class="wp-btn wp-x" data-ix aria-label="${esc(T("Close"))}">×</button>
      <h2>${esc(T("Inbox"))}</h2>
      <section><h3>${esc(T("Gifts"))}</h3>${!s ? `<p class="wp-inbox-empty">${esc(T("Sign in with your wallet to get gifts from other players."))}</p>`
        : gifts ? `<p>${esc(gifts === 1 ? T("A gift is waiting for you.") : T("{n} gifts are waiting for you.", { n: gifts }))}</p><button type="button" class="wp-cta" data-itake>${esc(T("Open gifts"))}</button>`
        : `<p class="wp-inbox-empty">${esc(T("No gifts right now. Players can send you potions or scrap from your card."))}</p>`}</section>
      <section><h3>${esc(T("Guestbook"))}</h3>${book ? `<p>${esc(book === 1 ? T("A new stamp on your island.") : T("{n} new stamps on your island.", { n: book }))}</p><button type="button" class="wp-btn" data-ibook>${esc(T("Go to my island"))}</button>`
        : `<p class="wp-inbox-empty">${esc(T("No new stamps."))}</p>`}</section>
      <section><h3>${esc(T("Friends playing now"))}</h3>${fr.length ? `<ul>${fr.map((w) => `<li><button type="button" class="wp-inbox-who" data-iprof="${esc(w.wallet)}"><b>${esc(w.name)}</b><small>${esc(T("Lv {n}", { n: w.lv || 1 }))}</small></button>${ctx.inHub() ? `<button type="button" class="wp-btn" data-igo="${esc(w.wallet)}">${esc(T("Go there"))}</button>` : ""}</li>`).join("")}</ul>`
        : `<p class="wp-inbox-empty">${esc(T("None of your friends is in town right now."))}</p>`}</section></div>`;
  }
  function show() {
    if (!el) {
      el = document.createElement("div"); el.className = "wp-inbox"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
      el.addEventListener("click", onClick); document.body.appendChild(el);
      addEventListener("keydown", (e) => { if (open && e.key === "Escape") { e.stopImmediatePropagation(); hide(); } }, true);
    }
    open = true; keep = false; el.hidden = false; paint(); poll(true);
  }
  function hide() { if (!el) return; open = false; el.hidden = true; }
  async function take() {
    const s = ctx.sess(); if (!s) return;
    const r = await ctx.post({ action: "world-gifts-take", ...s }).catch(() => ({ ok: false, j: {} }));
    if (!r.ok) { ctx.toast(r.j.error || T("Couldn't open the gifts right now")); return; }
    const list = r.j.gifts || [], rp = ctx.rpg(), d = rp && rp.data();
    for (const g of list) { if (!d) break; if (g.kind === "scrap") d.scrap = (d.scrap || 0) + g.n; else d[g.kind] = (d[g.kind] || 0) + g.n; }
    if (rp && list.length) rp.refresh && rp.refresh();
    ctx.save && ctx.save(); ctx.onPots && ctx.onPots();
    gifts = 0; paintDot(); keep = true;
    if (el) {
      el.querySelector(".wp-inbox-card section").innerHTML = `<h3>${esc(T("Gifts"))}</h3><ul class="wp-inbox-gifts">${list.map((g) => `<li><b>${esc(g.name || g.from.slice(0, 6) + "…")}</b> ${esc(T("sent you {x}", { x: giftText(g) }))}</li>`).join("") || `<li>${esc(T("Nothing was waiting after all."))}</li>`}</ul>`;
    }
    if (list.length) { ctx.Snd.win && ctx.Snd.win(); ctx.toast(list.length === 1 ? T("Gift opened") : T("{n} gifts opened", { n: list.length })); }
  }
  function onClick(e) {
    const b = e.target.closest("button");
    if (e.target === el || (b && b.hasAttribute("data-ix"))) { hide(); return; }
    if (!b) return;
    if (b.hasAttribute("data-itake")) { take(); return; }
    if (b.hasAttribute("data-ibook")) { hide(); ctx.goIsland({}); return; }
    if (b.dataset.iprof) { hide(); ctx.openProfile(b.dataset.iprof); return; }
    if (b.dataset.igo) { const w = friendsOn().find((x) => x.wallet === b.dataset.igo); if (w) { hide(); ctx.goNear(w.x, w.z); } }
  }

  // sending: from a player's card, one of a few small gifts out of your own bag
  const SEND = [{ kind: "hp", n: 1 }, { kind: "sp", n: 1 }, { kind: "scrap", n: 50 }];
  function sendOptions() {
    const d = ctx.rpg() && ctx.rpg().data(); if (!d) return [];
    return SEND.map((g) => ({ ...g, can: g.kind === "scrap" ? (d.scrap || 0) >= g.n : (d[g.kind] || 0) >= g.n, label: giftText(g) }));
  }
  async function send(to, kind, n) {
    const s = ctx.sess(); if (!s) { ctx.toast(T("Sign in with your wallet first")); return false; }
    const d = ctx.rpg() && ctx.rpg().data(); if (!d) return false;
    const have = kind === "scrap" ? d.scrap || 0 : d[kind] || 0; if (have < n) { ctx.toast(T("You don't have that many")); return false; }
    const r = await ctx.post({ action: "world-gift", ...s, to, kind, n }).catch(() => ({ ok: false, j: {} }));
    if (!r.ok) { ctx.toast(r.j.error ? T(r.j.error) : T("Couldn't send that right now")); return false; }
    if (kind === "scrap") d.scrap -= n; else d[kind] -= n;
    ctx.rpg().refresh && ctx.rpg().refresh(); ctx.save && ctx.save(); ctx.onPots && ctx.onPots();
    ctx.Snd.pick && ctx.Snd.pick(); ctx.toast(T("Sent: {x}", { x: giftText({ kind, n }) }));
    return true;
  }

  poll(true); setInterval(() => poll(false), 20e3);
  return { poll, paintDot, show, hide, isOpen: () => open, sendOptions, send };
}
