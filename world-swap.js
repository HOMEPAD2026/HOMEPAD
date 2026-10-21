// world-swap.js — the Exchange window: $ARCL ⇄ $ARCIRCLE by request (api/_world-swap.mjs). You choose the way and the
// amount (for $ARCIRCLE → ARCL you first send the tokens to the exchange desk on Arc and paste the transaction); the
// team compares both markets and settles each request by hand for now. Your requests and their state are listed;
// the team (a GM wallet) gets a third tab with the queue to settle or turn down. Loaded the first time it's opened.
const ICON = {
  arcl: '<img class="wx-ic" src="/images/arcl2-logo.webp?v=1" alt="" aria-hidden="true" draggable="false">', // the $ARCL logo (the owner's)
  arc: '<svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="wxG2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b2a6b"/><stop offset="1" stop-color="#070d2a"/></linearGradient><linearGradient id="wxG3" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#35b8ff"/><stop offset=".5" stop-color="#8a7bff"/><stop offset="1" stop-color="#2ee07a"/></linearGradient></defs><circle cx="20" cy="20" r="18" fill="url(#wxG2)" stroke="#35b8ff" stroke-opacity=".7" stroke-width="2"/><path d="M8.5 20c0-3.3 2.6-6 5.9-6 4.6 0 6.6 12 11.2 12 3.3 0 5.9-2.7 5.9-6s-2.6-6-5.9-6c-4.6 0-6.6 12-11.2 12-3.3 0-5.9-2.7-5.9-6z" fill="none" stroke="url(#wxG3)" stroke-width="3.4" stroke-linecap="round"/></svg>',
};
const NAME = { arcl: "$ARCL", arc: "$ARCIRCLE" };
const DIRS = { arcl2arc: ["arcl", "arc"], arc2arcl: ["arc", "arcl"] };
const fmt = (n) => (n == null ? "—" : Math.floor(n).toLocaleString("en-US"));
const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");

export function createSwap(ctx) {
  const { T, esc, toast } = ctx, Snd = ctx.Snd || {};
  let el = null, data = null, dir = "arcl2arc", tab = "ex", busy = false, queue = null;
  const api = async (action, extra = {}) => { const s = ctx.sess(); if (!s) return { ok: false, j: { error: T("Connect your wallet to exchange") } }; try { return await ctx.post({ action, ...s, ...extra }); } catch (e) { return { ok: false, j: { error: String((e && e.message) || e) } }; } };
  async function load() {
    const s = ctx.sess(); if (!s) { data = null; return; }
    try { const r = await fetch("/api/social?world=swap&wallet=" + s.wallet, { cache: "no-store" }); data = r.ok ? await r.json() : null; } catch { data = null; }
  }
  const have = (k) => (!data ? null : k === "arcl" ? data.arcl && data.arcl.bal : data.arcircle);
  const statusChip = (st) => `<span class="wx-st ${esc(st)}">${esc(T({ pending: "Waiting", done: "Done", rejected: "Turned down", cancelled: "Cancelled" }[st] || st))}</span>`;
  const when = (t) => { try { return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

  function build() {
    el = document.createElement("div"); el.className = "wx"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", T("Exchange"));
    el.innerHTML = `<div class="wx-in"><header class="wx-hd"><span class="wx-logos">${ICON.arcl}${ICON.arc}</span><div><b>${esc(T("Exchange"))}</b><small>$ARCL ⇄ $ARCIRCLE</small></div><button type="button" class="wx-x" aria-label="${esc(T("Close"))}">✕</button></header>
      <nav class="wx-tabs" role="tablist"></nav><section class="wx-body"></section></div>`;
    document.body.appendChild(el);
    el.addEventListener("click", (e) => {
      if (e.target === el || e.target.closest(".wx-x")) { close(); return; }
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.tab) { tab = b.dataset.tab; if (tab === "gm") loadQueue(); paint(); (Snd.tab || (() => {}))(); }
      else if (b.classList.contains("wx-flip")) { dir = dir === "arcl2arc" ? "arc2arcl" : "arcl2arc"; paint(); (Snd.tab || (() => {}))(); }
      else if (b.classList.contains("wx-max")) { const i = el.querySelector(".wx-amt"); const h = have(DIRS[dir][0]); if (i && h != null) { i.value = fmt(Math.min(h, data.limits.max[DIRS[dir][0]])); live(); } }
      else if (b.classList.contains("wx-copy")) { try { navigator.clipboard.writeText(data.desk); toast(T("Address copied")); } catch { /* no clipboard */ } }
      else if (b.classList.contains("wx-go")) ask();
      else if (b.dataset.cancel) cancel(b.dataset.cancel);
      else if (b.dataset.done) settle(b.dataset.done, "done");
      else if (b.dataset.reject) settle(b.dataset.reject, "reject");
    });
    el.addEventListener("input", (e) => { if (e.target.classList.contains("wx-amt")) { const v = e.target.value.replace(/[^0-9]/g, ""); e.target.value = v ? Number(v).toLocaleString("en-US") : ""; live(); } });
    addEventListener("keydown", (e) => { if (el && !el.hidden && e.key === "Escape") { e.stopPropagation(); close(); } }, true);
  }
  const amtNow = () => { const i = el && el.querySelector(".wx-amt"); return i ? Number(i.value.replace(/[^0-9]/g, "")) || 0 : 0; };
  // the button and the warning follow what's typed
  function live() {
    const [from] = DIRS[dir], a = amtNow(), h = have(from), L = data && data.limits, go = el.querySelector(".wx-go"), w = el.querySelector(".wx-warn"); if (!go) return;
    let why = ""; if (!ctx.sess()) why = T("Connect your wallet to exchange"); else if (!a) why = ""; else if (L && a < L.min[from]) why = T("The least is {n}", { n: fmt(L.min[from]) + " " + NAME[from] }); else if (L && a > L.max[from]) why = T("The most at once is {n}", { n: fmt(L.max[from]) + " " + NAME[from] }); else if (h != null && a > h) why = T("More than your balance");
    if (dir === "arc2arcl") { const tx = (el.querySelector(".wx-tx") || {}).value || ""; if (a && !why && !/^0x[0-9a-fA-F]{64}$/.test(tx.trim())) why = T("Paste the transaction hash of your transfer"); }
    w.textContent = why; w.hidden = !why; go.disabled = !a || !!why || busy;
  }
  function paintTabs() {
    const pend = data && data.mine ? data.mine.filter((r) => r.status === "pending").length : 0;
    el.querySelector(".wx-tabs").innerHTML = `<button type="button" role="tab" data-tab="ex" aria-selected="${tab === "ex"}">${esc(T("Exchange"))}</button><button type="button" role="tab" data-tab="mine" aria-selected="${tab === "mine"}">${esc(T("My requests"))}${pend ? `<i>${pend}</i>` : ""}</button>${data && data.gm ? `<button type="button" role="tab" data-tab="gm" aria-selected="${tab === "gm"}">${esc(T("Team queue"))}${queue ? `<i>${queue.filter((r) => r.status === "pending").length}</i>` : ""}</button>` : ""}`;
  }
  function paintEx() {
    const [from, to] = DIRS[dir], h = have(from), hTo = have(to);
    const card = (k, give) => `<div class="wx-card ${give ? "give" : "get"}"><div class="wx-row"><small>${esc(T(give ? "You give" : "You get"))}</small><small class="wx-bal">${esc(T("Balance"))} <b>${fmt(give ? h : hTo)}</b>${give && h != null ? `<button type="button" class="wx-max">MAX</button>` : ""}</small></div>
      <div class="wx-row"><span class="wx-tok">${ICON[k]}<b>${NAME[k]}</b></span>${give ? `<input class="wx-amt" inputmode="numeric" autocomplete="off" placeholder="0" aria-label="${esc(T("Amount"))}">` : `<span class="wx-est">${esc(T("Set by the team"))}</span>`}</div></div>`;
    const steps = dir === "arcl2arc" ? [T("Enter how much $ARCL to exchange and send the request."), T("Your $ARCL is held right away, so it can't be spent twice."), T("The team compares both markets and sends you $ARCIRCLE on Arc.")]
      : [T("Send $ARCIRCLE to the exchange desk on Arc (address below)."), T("Paste the transaction hash and enter the amount you sent."), T("The team compares both markets and credits your $ARCL.")];
    return `${card(from, true)}<button type="button" class="wx-flip" aria-label="${esc(T("Switch direction"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v14m0 0-3-3m3 3 3-3M17 20V6m0 0-3 3m3-3 3 3"/></svg></button>${card(to, false)}
      ${dir === "arc2arcl" && data ? `<div class="wx-desk"><small>${esc(T("Exchange desk on Arc"))}</small><div class="wx-row"><code>${esc(data.desk)}</code><button type="button" class="wx-copy">${esc(T("Copy"))}</button></div><input class="wx-tx" placeholder="${esc(T("Transaction hash 0x…"))}" autocomplete="off" spellcheck="false"></div>` : ""}
      <p class="wx-warn" hidden></p>
      <button type="button" class="wx-go" disabled>${esc(T("Request exchange"))}</button>
      <div class="wx-how"><b>${esc(T("How it works"))}</b><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol><p>${esc(T("For now each request is settled by hand at a rate set from both markets. An automatic rate and instant exchange are coming."))}</p></div>`;
  }
  function paintMine() {
    if (!ctx.sess()) return `<p class="wx-empty">${esc(T("Connect your wallet to exchange"))}</p>`;
    const L = (data && data.mine) || []; if (!L.length) return `<p class="wx-empty">${esc(T("No requests yet"))}</p>`;
    return `<ul class="wx-list">${L.map((r) => { const [f, t] = DIRS[r.dir] || ["arcl", "arc"];
      return `<li><div class="wx-pair">${ICON[f]}${ICON[t]}</div><div class="wx-li"><b>${fmt(r.amount)} ${NAME[f]} → ${NAME[t]}</b><small>${esc(when(r.at))}${r.status === "done" ? ` · ${esc(T("Received"))} <b>${fmt(r.give)} ${NAME[t]}</b>` : ""}${r.reason ? ` · ${esc(r.reason)}` : ""}</small></div>${statusChip(r.status)}${r.status === "pending" && r.dir === "arcl2arc" ? `<button type="button" class="wx-cancel" data-cancel="${esc(r.id)}">${esc(T("Cancel"))}</button>` : ""}</li>`; }).join("")}</ul>`;
  }
  function paintGm() {
    if (!queue) return `<p class="wx-empty">${esc(T("Loading…"))}</p>`;
    const L = queue.slice().sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || b.at - a.at); if (!L.length) return `<p class="wx-empty">${esc(T("No requests yet"))}</p>`;
    return `<ul class="wx-list gm">${L.map((r) => { const [f, t] = DIRS[r.dir] || ["arcl", "arc"];
      return `<li><div class="wx-pair">${ICON[f]}${ICON[t]}</div><div class="wx-li"><b>${fmt(r.amount)} ${NAME[f]} → ${NAME[t]}</b><small><code>${esc(short(r.w))}</code> · ${esc(when(r.at))}${r.tx ? ` · tx <code>${esc(short(r.tx))}</code>` : ""}${r.status === "done" ? ` · ${fmt(r.give)} ${NAME[t]}` : ""}</small>
        ${r.status === "pending" ? `<div class="wx-gmf" data-id="${esc(r.id)}"><input class="wx-give" inputmode="numeric" placeholder="${esc(T("Give ({x})", { x: NAME[t] }))}">${r.dir === "arcl2arc" ? `<input class="wx-gtx" placeholder="${esc(T("Your Arc tx 0x…"))}" spellcheck="false">` : ""}<input class="wx-note" placeholder="${esc(T("Note (optional)"))}"><div><button type="button" class="ok" data-done="${esc(r.id)}">${esc(T("Settle"))}</button><button type="button" class="no" data-reject="${esc(r.id)}">${esc(T("Turn down"))}</button></div></div>` : ""}</div>${statusChip(r.status)}</li>`; }).join("")}</ul>`;
  }
  function paint() {
    if (!el) return; paintTabs();
    el.querySelector(".wx-body").innerHTML = tab === "mine" ? paintMine() : tab === "gm" ? paintGm() : paintEx();
    if (tab === "ex") live();
  }
  async function loadQueue() { const r = await api("world-swap-admin", { op: "list" }); queue = r.ok ? r.j.list : []; if (tab === "gm") paint(); }
  async function ask() {
    if (busy) return; const a = amtNow(); if (!a) return; busy = true; live();
    const extra = { dir, amount: a }; if (dir === "arc2arcl") extra.tx = ((el.querySelector(".wx-tx") || {}).value || "").trim();
    const r = await api("world-swap-ask", extra); busy = false;
    if (!r.ok) { toast(T("Couldn't send the request: {e}", { e: String((r.j && r.j.error) || "").slice(0, 80) })); live(); return; }
    (Snd.buy || Snd.equip || (() => {}))(); toast(T("Request sent. The team will settle it soon."));
    await load(); tab = "mine"; paint(); if (ctx.refresh) ctx.refresh();
  }
  async function cancel(id) {
    if (busy) return; busy = true; const r = await api("world-swap-cancel", { id }); busy = false;
    if (!r.ok) { toast(T("Couldn't cancel: {e}", { e: String((r.j && r.j.error) || "").slice(0, 80) })); return; }
    toast(T("Cancelled: your $ARCL is back")); await load(); paint(); if (ctx.refresh) ctx.refresh();
  }
  async function settle(id, op) {
    if (busy) return; const f = el.querySelector(`.wx-gmf[data-id="${CSS.escape(id)}"]`); if (!f) return;
    const give = Number((f.querySelector(".wx-give").value || "").replace(/[^0-9]/g, "")), gmTx = ((f.querySelector(".wx-gtx") || {}).value || "").trim(), note = f.querySelector(".wx-note").value.trim();
    if (op === "done" && !give) { toast(T("Enter how much was given")); return; }
    busy = true; const r = await api("world-swap-admin", { op, id, give, gmTx, note }); busy = false;
    if (!r.ok) { toast(String((r.j && r.j.error) || "")); return; }
    toast(op === "done" ? T("Settled") : T("Turned down")); await loadQueue();
  }
  async function open() {
    if (!el) build(); el.hidden = false; requestAnimationFrame(() => el.classList.add("on")); tab = "ex"; paint();
    await load(); paint(); if (data && data.gm) loadQueue();
  }
  function close() { if (!el) return; el.classList.remove("on"); el.hidden = true; if (ctx.onClose) ctx.onClose(); }
  return { open, close, isOpen: () => !!(el && !el.hidden) };
}
