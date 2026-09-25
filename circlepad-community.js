/* global state, ethers, connectWallet, cpToast, cpErrText, CONFIG, circlepadLogCache, readProvider, refreshAccountDependentViews */
// circlepad-community.js — CirclePad's community layer (api/_circle.mjs via
// /api/social): pledges before the raise opens, the round Q&A, the board of
// candidate projects for future rounds, referral links and credit, and the
// leaderboard chips ($ARCIRCLE holder, ArcPad creator, "brought in").
// Plus the personal bits: invite link, share card, contribution history.
// Every post is signed by the wallet (free, no transaction); the messages
// below must match api/_circle.mjs byte for byte.
(function () {
  "use strict";
  if (!document.body.classList.contains("circlepad-page") || typeof CONFIG === "undefined" || !CONFIG.CIRCLEPAD_ESCROW_ADDRESS) return;
  const API = "/api/social";
  const ESCROW = CONFIG.CIRCLEPAD_ESCROW_ADDRESS.toLowerCase();
  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const toast = (m, k) => (typeof cpToast === "function" ? cpToast(tr(m), k) : console.log(m));
  const num = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: n >= 10000 ? 0 : 2 });
  const hue = (a) => (parseInt(String(a).slice(2, 8), 16) || 0) % 360;
  const dot = (a, size = 22) => `<span class="cp-av" style="--h:${hue(a)};--s:${size}px" aria-hidden="true"></span>`;
  const ago = (ms) => { const s = Math.max(1, Math.floor((Date.now() - ms) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
  const me = () => (state && state.account ? lc(state.account) : null);
  const started = () => document.body.classList.contains("cp-started");
  const kec = (t) => ethers.keccak256(ethers.toUtf8Bytes(String(t)));

  // ---- messages: identical to api/_circle.mjs ----
  const pledgeMessage = (wallet, amount, issued) => `ARCIRCLE PAD — CirclePad pledge\nRound: ${ESCROW}\nWallet: ${lc(wallet)}\nAmount: ${amount} USDC\nIssued: ${issued}`;
  const qaMessage = (wallet, text, parent, issued) => `ARCIRCLE PAD — CirclePad Q&A\nRound: ${ESCROW}\nWallet: ${lc(wallet)}\nReply to: ${parent || "-"}\nIssued: ${issued}\nText: ${kec(text)}`;
  const propMessage = (wallet, p, issued) => `ARCIRCLE PAD — CirclePad proposal\nWallet: ${lc(wallet)}\nIssued: ${issued}\nContent: ${kec(JSON.stringify([p.title, p.pitch, p.link]))}`;
  const upMessage = (wallet, id) => `ARCIRCLE PAD — upvote CirclePad proposal\nProposal: ${id}\nWallet: ${lc(wallet)}`;
  const hideMessage = (wallet, kind, id, issued) => `ARCIRCLE PAD — CirclePad moderation\nRound: ${ESCROW}\nHide ${kind}: ${id}\nWallet: ${lc(wallet)}\nIssued: ${issued}`;

  // ================= referral links =================
  // arcircle-hub.js already keeps the first ?ref=<wallet> a visitor arrives
  // with (30 days, this browser). circlepad.js asks this function when it
  // sends contribute(), and appends the referrer to the calldata.
  window.circlepadReferrer = function () {
    const r = typeof window.arcRef === "function" ? window.arcRef() : null;
    return r && /^0x[0-9a-f]{40}$/.test(r) && r !== me() ? r : null;
  };
  const inviteUrl = (w) => `https://www.arcircle.app/circle?ref=${w}`;
  const cardUrl = (w) => `https://www.arcircle.app/round${w ? `?w=${w}` : ""}`;

  // ================= data =================
  let D = null, busy = false;
  async function load() {
    try {
      const r = await fetch(`${API}?circle=1${me() ? `&wallet=${me()}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      D = j && j.enabled ? j : null;
    } catch (e) { /* keep last */ }
    render();
  }
  async function signed(fn) {
    if (!state.account || !state.signer) {
      if (typeof connectWallet === "function") await connectWallet();
      if (!state.account || !state.signer) return null;
    }
    return fn(me(), new Date().toISOString());
  }
  async function post(body) {
    const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { api: true, j });
    return j;
  }
  const errMsg = (e) => (e && e.api ? e.message : typeof cpErrText === "function" ? cpErrText(e) : (e && e.message) || "Failed");

  // ================= pledges (before the raise opens) =================
  function renderPledge() {
    const panel = $("bp-round-panel");
    if (!panel) return;
    let box = $("cp-pledge");
    const show = !!D && !started();
    if (window.circlepadFx) window.circlepadFx.setPledged(show ? D.pledges.total : null, show ? D.pledges.count : 0);
    if (!show) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement("div");
      box.id = "cp-pledge"; box.className = "cp-pledge";
      const meta = panel.querySelector(".cp-ring-meta");
      (meta || panel.firstChild).insertAdjacentElement(meta ? "afterend" : "beforebegin", box);
      box.addEventListener("click", onPledgeClick);
      box.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.id === "cp-pl-amt") onPledgeClick({ target: box.querySelector("[data-pl-go]") }); });
    }
    const p = D.pledges, mine = D.myPledge;
    const html = `<div class="cp-pl-head"><span class="cp-pl-av">${p.top.slice(0, 6).map((x) => dot(x.wallet, 20)).join("")}</span>
        <span>${p.count ? `<b data-no-i18n>${num(p.total)} USDC</b> <span>pledged by</span> <b data-no-i18n>${p.count}</b> <span>${p.count === 1 ? "wallet" : "wallets"}</span>` : `<span>Be the first to pledge.</span>`}</span></div>
      ${mine ? `<div class="cp-pl-mine"><span>Your pledge</span> <b data-no-i18n>${num(mine)} USDC</b><button type="button" class="cp-link" data-pl-edit>Change</button><button type="button" class="cp-link" data-pl-cancel>Cancel</button></div>` : ""}
      <div class="cp-pl-form"${mine ? " hidden" : ""}><input type="number" min="0" step="0.01" inputmode="decimal" id="cp-pl-amt" class="bp-contribute-input" placeholder="${esc(tr("USDC you plan to put in"))}"><button type="button" class="bp-btn-primary" data-pl-go>Pledge</button></div>
      <small class="cp-pl-note">A pledge is a signed note, not a payment — nothing leaves your wallet. Change or cancel it until the raise opens.</small>`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }
  async function onPledgeClick(e) {
    const t = e.target;
    if (t.closest("[data-pl-edit]")) { const f = $("cp-pledge").querySelector(".cp-pl-form"); f.hidden = false; $("cp-pl-amt").value = D.myPledge || ""; $("cp-pl-amt").focus(); return; }
    const cancel = t.closest("[data-pl-cancel]"), go = t.closest("[data-pl-go]");
    if (!cancel && !go) return;
    if (busy) return;
    let amount = cancel ? "0" : String(($("cp-pl-amt") || {}).value || "").trim();
    if (!cancel) {
      if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) { toast("Enter an amount in USDC, up to 2 decimals.", "bad"); return; }
      amount = String(Number(amount)); // "0100.50" → "100.5", the form the server re-signs
    }
    busy = true;
    try {
      const r = await signed(async (wallet, issued) => {
        const signature = await state.signer.signMessage(pledgeMessage(wallet, amount, issued));
        return post({ action: "pledge", wallet, amount, issued, signature });
      });
      if (!r) return;
      toast(cancel ? "Pledge cancelled." : "Pledged — you'll be first in line when the raise opens.", "ok");
      if (!cancel && typeof window.arcFeedback === "function") window.arcFeedback("milestone");
      await load();
    } catch (err) { toast(errMsg(err), "bad"); } finally { busy = false; }
  }

  // ================= round Q&A =================
  let qaParent = null, qaAll = false;
  function renderQA() {
    const anchor = document.querySelector("#bp-panel-home .bp-row3");
    let card = $("cp-qa");
    if (!D) { if (card) card.remove(); return; }
    if (!card && anchor) {
      card = document.createElement("section");
      card.id = "cp-qa"; card.className = "bp-card cp-qa";
      anchor.insertAdjacentElement("afterend", card);
      card.innerHTML = `<div class="bp-card-head"><span>Round Q&amp;A <span class="cp-count" id="cp-qa-count" data-no-i18n></span></span><span class="cp-qa-hint">Ask the team or the circle</span></div>
        <div class="cp-qa-form"><div class="cp-qa-reply" id="cp-qa-reply" hidden></div>
          <textarea id="cp-qa-text" maxlength="500" rows="2" placeholder="${esc(tr("Ask a question about the round…"))}"></textarea>
          <div class="cp-qa-foot"><small>Signed with your wallet. Pledgers, contributors and $ARCIRCLE holders can post.</small><button type="button" class="bp-btn-primary" id="cp-qa-post">Post</button></div></div>
        <div class="cp-qa-list" id="cp-qa-list"></div>`;
      card.addEventListener("click", onQAClick);
    }
    if (!card) return;
    const rec = lc(D.recipient), isTeam = me() && me() === rec;
    const roots = D.qa.filter((q) => !q.parent).reverse();
    const kids = (id) => D.qa.filter((q) => q.parent === id);
    const item = (q, reply) => `<div class="cp-qa-item${reply ? " is-reply" : ""}${q.team ? " is-team" : ""}" data-id="${q.id}">
        ${dot(q.wallet, reply ? 18 : 24)}<div class="cp-qa-body"><div class="cp-qa-meta"><b data-no-i18n>${short(q.wallet)}</b>${q.team ? `<span class="cp-team">Team</span>` : ""}<span class="cp-ago" data-no-i18n>${ago(q.at)}</span></div>
        <p data-no-i18n>${esc(q.text).replace(/\n/g, "<br>")}</p>
        <div class="cp-qa-acts">${reply ? "" : `<button type="button" class="cp-link" data-qa-reply="${q.id}">Reply</button>`}${isTeam ? `<button type="button" class="cp-link cp-muted" data-hide="qa:${q.id}">Hide</button>` : ""}</div></div></div>`;
    const shown = qaAll ? roots : roots.slice(0, 4);
    const html = roots.length
      ? shown.map((q) => `<div class="cp-thread">${item(q)}${kids(q.id).map((r) => item(r, true)).join("")}</div>`).join("")
        + (roots.length > shown.length ? `<button type="button" class="cp-more" data-qa-all>${tr("Show all")} (${roots.length})</button>` : "")
      : `<div class="bp-empty cp-empty-qa">No questions yet — ask the first one.</div>`;
    const list = $("cp-qa-list");
    if (list.__html !== html) { list.innerHTML = html; list.__html = html; }
    $("cp-qa-count").textContent = D.qa.length ? String(D.qa.length) : "";
  }
  async function onQAClick(e) {
    const t = e.target;
    const rp = t.closest("[data-qa-reply]");
    if (rp) {
      qaParent = rp.dataset.qaReply;
      const q = D.qa.find((x) => x.id === qaParent);
      const box = $("cp-qa-reply");
      box.hidden = false; box.innerHTML = `<span>${tr("Replying to")} <b data-no-i18n>${short(q ? q.wallet : "")}</b></span><button type="button" class="cp-link" data-qa-unreply>×</button>`;
      $("cp-qa-text").focus();
      return;
    }
    if (t.closest("[data-qa-unreply]")) { qaParent = null; $("cp-qa-reply").hidden = true; return; }
    if (t.closest("[data-qa-all]")) { qaAll = true; renderQA(); return; }
    const hid = t.closest("[data-hide]");
    if (hid) return hideItem(hid.dataset.hide);
    if (!t.closest("#cp-qa-post") || busy) return;
    const text = String($("cp-qa-text").value || "").replace(/\s+\n/g, "\n").trim();
    if (text.length < 3) { toast("Write at least 3 characters.", "bad"); return; }
    busy = true;
    const btn = $("cp-qa-post"); btn.disabled = true;
    try {
      const parent = qaParent || "";
      const r = await signed(async (wallet, issued) => post({ action: "cqa", wallet, text, parent, issued, signature: await state.signer.signMessage(qaMessage(wallet, text, parent, issued)) }));
      if (!r) return;
      $("cp-qa-text").value = ""; qaParent = null; $("cp-qa-reply").hidden = true;
      toast("Posted.", "ok");
      await load();
      const el = document.querySelector(`#cp-qa-list [data-id="${r.id}"]`);
      if (el) el.classList.add("cp-new");
    } catch (err) { toast(errMsg(err), "bad"); } finally { busy = false; btn.disabled = false; }
  }
  async function hideItem(spec) {
    const [kind, id] = spec.split(":");
    try {
      const r = await signed(async (wallet, issued) => post({ action: "chide", wallet, kind, id, issued, signature: await state.signer.signMessage(hideMessage(wallet, kind, id, issued)) }));
      if (r) { toast("Hidden.", "ok"); await load(); }
    } catch (err) { toast(errMsg(err), "bad"); }
  }

  // ================= proposals (Projects tab) =================
  function renderProps() {
    const panel = $("bp-panel-projects");
    if (!panel) return;
    const wrap = panel.querySelector(".bp-simple");
    let board = $("cp-props");
    if (!D) { if (board) board.remove(); return; }
    if (!board) {
      const intro = wrap.querySelector("p"), empty = wrap.querySelector(".bp-empty");
      if (intro) intro.textContent = tr("Propose a project for a future CirclePad round, and back the ones you'd put USDC into. The most-backed ideas are the shortlist for the next round.");
      if (empty) empty.remove();
      board = document.createElement("div");
      board.id = "cp-props"; board.className = "cp-props";
      board.innerHTML = `<div class="cp-prop-form bp-card"><div class="bp-card-head">Propose a project</div>
          <input id="cp-prop-title" class="bp-contribute-input" maxlength="80" placeholder="${esc(tr("Project name"))}">
          <textarea id="cp-prop-pitch" class="bp-contribute-input" maxlength="400" rows="3" placeholder="${esc(tr("What is it, and why should the circle fund it? (10–400 characters)"))}"></textarea>
          <input id="cp-prop-link" class="bp-contribute-input" maxlength="200" placeholder="${esc(tr("Link (optional) — https://…"))}">
          <div class="cp-qa-foot"><small>Signed with your wallet. Three a day per wallet.</small><button type="button" class="bp-btn-primary" id="cp-prop-go">Submit</button></div></div>
        <div class="cp-prop-list" id="cp-prop-list"></div>`;
      wrap.appendChild(board);
      board.addEventListener("click", onPropClick);
    }
    const isTeam = me() && me() === lc(D.recipient);
    const mineUp = new Set(D.myUpvotes || []);
    const html = D.proposals.length ? D.proposals.map((p, i) => `<article class="cp-prop${i < 3 ? " is-top" : ""}" data-id="${p.id}">
        <button type="button" class="cp-up${mineUp.has(p.id) ? " on" : ""}" data-up="${p.id}" aria-pressed="${mineUp.has(p.id)}" aria-label="Back this project"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg><b data-no-i18n>${p.up}</b></button>
        <div class="cp-prop-main"><h3 data-no-i18n>${esc(p.title)}</h3><p data-no-i18n>${esc(p.pitch)}</p>
          <div class="cp-qa-meta">${dot(p.wallet, 16)}<span data-no-i18n>${short(p.wallet)}</span><span class="cp-ago" data-no-i18n>${ago(p.at)}</span>
          ${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="nofollow noopener ugc" data-no-i18n>${esc(p.link.replace(/^https:\/\//, "").slice(0, 40))} ↗</a>` : ""}
          ${isTeam ? `<button type="button" class="cp-link cp-muted" data-hide="prop:${p.id}">Hide</button>` : ""}</div></div></article>`).join("")
      : `<div class="bp-empty">No proposals yet — the first idea sets the bar.</div>`;
    const list = $("cp-prop-list");
    if (list.__html !== html) { list.innerHTML = html; list.__html = html; }
  }
  async function onPropClick(e) {
    const t = e.target;
    const hid = t.closest("[data-hide]");
    if (hid) return hideItem(hid.dataset.hide);
    const up = t.closest("[data-up]");
    if (up && !up.classList.contains("on")) {
      const id = up.dataset.up;
      try {
        const r = await signed(async (wallet) => post({ action: "cprop-up", wallet, id, signature: await state.signer.signMessage(upMessage(wallet, id)) }));
        if (r) { up.classList.add("on", "cp-pop"); const b = up.querySelector("b"); b.textContent = String(r.up); await load(); }
      } catch (err) { toast(errMsg(err), "bad"); }
      return;
    }
    if (!t.closest("#cp-prop-go") || busy) return;
    const p = { title: $("cp-prop-title").value.trim(), pitch: $("cp-prop-pitch").value.trim(), link: $("cp-prop-link").value.trim() };
    if (p.link && !/^https:\/\//i.test(p.link)) p.link = "https://" + p.link.replace(/^http:\/\//i, "");
    if (p.title.length < 3) { toast("Give the project a name (3+ characters).", "bad"); return; }
    if (p.pitch.length < 10) { toast("Add a short pitch (10+ characters).", "bad"); return; }
    busy = true;
    try {
      const r = await signed(async (wallet, issued) => post({ action: "cprop", wallet, ...p, issued, signature: await state.signer.signMessage(propMessage(wallet, p, issued)) }));
      if (!r) return;
      ["cp-prop-title", "cp-prop-pitch", "cp-prop-link"].forEach((id) => { $(id).value = ""; });
      toast("Proposal posted.", "ok");
      await load();
    } catch (err) { toast(errMsg(err), "bad"); } finally { busy = false; }
  }

  // ================= leaderboard chips =================
  const badgeCache = new Map();
  async function decorateLeaderboard() {
    const rows = [...document.querySelectorAll("#bp-full-leaderboard .bp-lb-row, #bp-home-leaderboard .bp-lb-row")];
    const addrOf = (r) => { const a = r.querySelector(".bp-lb-ext"); const m = a && /0x[0-9a-fA-F]{40}/.exec(a.getAttribute("href") || ""); return m ? lc(m[0]) : null; };
    const addrs = [...new Set(rows.map(addrOf).filter(Boolean))];
    const need = addrs.filter((a) => !badgeCache.has(a));
    if (need.length) {
      try {
        const j = await (await fetch(`${API}?circle=badges&addrs=${need.join(",")}`)).json();
        need.forEach((a) => badgeCache.set(a, (j.badges || {})[a] || {}));
      } catch (e) { /* chips are optional */ }
    }
    const refs = new Map(((D && D.refs) || []).map((r) => [lc(r.ref), r]));
    rows.forEach((r) => {
      const a = addrOf(r); if (!a) return;
      const b = badgeCache.get(a) || {}, rf = refs.get(a);
      const chips = [
        a === me() ? `<span class="cp-chip cp-chip-me">You</span>` : "",
        b.launches ? `<span class="cp-chip cp-chip-arc" title="${esc(tr("Launched coins on ArcPad"))}">ArcPad creator</span>` : "",
        b.arcircle ? `<span class="cp-chip cp-chip-hold">$ARCIRCLE</span>` : "",
        rf ? `<span class="cp-chip cp-chip-ref" title="${esc(tr("USDC contributed through this wallet's invite link"))}"><span>Brought in</span> <b data-no-i18n>${num(rf.amount)}</b></span>` : "",
      ].join("");
      const block = r.querySelector(".bp-lb-addr-block") || r;
      let c = block.querySelector(".cp-chips");
      if (!chips) { if (c) c.remove(); return; }
      if (!c) { c = document.createElement("div"); c.className = "cp-chips"; block.appendChild(c); }
      if (c.innerHTML !== chips) c.innerHTML = chips;
    });
    // Top inviters, under the full leaderboard
    const full = $("bp-full-leaderboard");
    if (full && D && D.refs.length) {
      let box = $("cp-inviters");
      if (!box) { box = document.createElement("div"); box.id = "cp-inviters"; box.className = "cp-inviters"; full.insertAdjacentElement("afterend", box); }
      box.innerHTML = `<h4>Top inviters</h4>` + D.refs.slice(0, 5).map((x, i) => `<div class="cp-inv-row"><span class="bp-lb-rank" data-no-i18n>#${i + 1}</span>${dot(x.ref, 18)}<span class="bp-lb-addr" data-no-i18n>${short(x.ref)}</span><span class="cp-inv-amt" data-no-i18n>${num(x.amount)} USDC · ${x.n}</span></div>`).join("");
    }
  }
  document.addEventListener("circlepad:lb", () => { decorateLeaderboard(); });

  // ================= invite + share card + history =================
  let hist = { key: null, html: "" };
  const blockTs = new Map();
  async function renderMine() {
    const w = me();
    const pos = $("bp-position-body");
    const side = $("bp-my-position");
    const mineAmt = window.circlepadFx ? window.circlepadFx.mine() : 0;
    // invite / share row, under the round panel's "your contribution" line
    let row = $("cp-share-row");
    if (w && mineAmt > 0 && side) {
      if (!row) { row = document.createElement("div"); row.id = "cp-share-row"; row.className = "cp-share-row"; side.insertAdjacentElement("afterend", row); row.addEventListener("click", onShare); }
      row.innerHTML = `<button type="button" class="cp-link" data-share-card><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.2 2.5h3.3l-7.2 8.2 8.5 10.8h-6.6l-5.2-6.6-5.9 6.6H1.8l7.7-8.8L1.3 2.5h6.8l4.7 6.1zm-1.2 17h1.8L7.1 4.4H5.2z"/></svg><span>Share my card</span></button><button type="button" class="cp-link" data-copy-invite><span>Copy invite link</span></button>`;
    } else if (row) row.remove();
    // My Position tab: history + the same actions
    const panel = $("bp-panel-position");
    if (!panel || !w) { const h = $("cp-history"); if (h) h.remove(); return; }
    let box = $("cp-history");
    if (!box) { box = document.createElement("div"); box.id = "cp-history"; box.className = "cp-history"; (pos || panel.lastElementChild).insertAdjacentElement("afterend", box); box.addEventListener("click", onShare); }
    let log = null;
    try { log = typeof circlepadLogCache === "function" ? circlepadLogCache() : null; } catch (e) { log = null; }
    const evs = log ? [...log.contributed.map((e) => ({ ...e, kind: "in" })), ...log.refunded.map((e) => ({ ...e, kind: "out" }))].filter((e) => lc(e.contributor) === w).sort((a, b) => b.blockNumber - a.blockNumber || (b.index || 0) - (a.index || 0)).slice(0, 25) : [];
    const missing = [...new Set(evs.map((e) => e.blockNumber))].filter((n) => !blockTs.has(n)).slice(0, 25);
    if (missing.length && typeof readProvider === "function") {
      try { const bs = await Promise.all(missing.map((n) => readProvider().getBlock(n))); missing.forEach((n, i) => blockTs.set(n, bs[i] ? Number(bs[i].timestamp) * 1000 : 0)); } catch (e) { /* times are optional */ }
    }
    const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
    const html = `<div class="cp-hist-acts"><button type="button" class="bp-btn-ghost" data-share-card><span>Share my card</span></button><button type="button" class="bp-btn-ghost" data-copy-invite><span>Copy invite link</span></button></div>
      <h4>Your activity</h4>${evs.length ? evs.map((e) => `<div class="cp-hist-row cp-hist-${e.kind}"><span class="cp-hist-k">${e.kind === "in" ? "Contributed" : "Withdrew"}</span><b data-no-i18n>${e.kind === "in" ? "+" : "−"}${num(Number(ethers.formatEther(BigInt(e.amount))))} USDC</b><span class="cp-ago" data-no-i18n>${esc(fmtTime(blockTs.get(e.blockNumber)))}</span></div>`).join("")
        : `<div class="bp-empty">Nothing yet from this wallet in this round.</div>`}`;
    if (hist.key !== w || hist.html !== html) { box.innerHTML = html; hist = { key: w, html }; }
  }
  async function onShare(e) {
    const w = me(); if (!w) return;
    if (e.target.closest("[data-share-card]")) {
      const text = `I'm in the CirclePad round on Arc 💚 One project, one 72h USDC raise — and everyone in it votes on what it becomes.`;
      window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(cardUrl(w))}&via=ARCIRCLEonArc`, "_blank", "noopener,width=600,height=560");
    } else if (e.target.closest("[data-copy-invite]")) {
      try { await navigator.clipboard.writeText(inviteUrl(w)); toast("Invite link copied — contributions through it are credited to you.", "ok"); }
      catch (err) { toast(inviteUrl(w)); }
    }
  }

  // ================= wiring =================
  function render() {
    try { renderPledge(); renderQA(); renderProps(); decorateLeaderboard(); renderMine(); } catch (e) { console.warn("circlepad-community", e); }
  }
  if (typeof refreshAccountDependentViews === "function") {
    const orig = refreshAccountDependentViews;
    // eslint-disable-next-line no-global-assign
    refreshAccountDependentViews = function () { orig.apply(this, arguments); load(); };
  }
  document.addEventListener("circlepad:state", () => { renderPledge(); renderMine(); });
  document.addEventListener("arc:lang", render);
  load();
  setInterval(() => { if (!document.hidden) load(); }, 30e3);
})();
