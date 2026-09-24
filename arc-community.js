/* global APC, CONFIG, state, ethers, connectWallet, apcRenderHeader, refreshAccountDependentViews */
// arc-community.js — ArcPad coin page: creator-edited profile (description,
// links, banner), the creator's verified X account, and the daily
// Bullish / Bearish vote. Everything is signed by the wallet (free, no
// transaction) and checked by /api/social before it is stored.
// When the server has no database configured it answers { enabled: false }
// and none of this UI appears.
(function () {
  "use strict";
  if (typeof APC === "undefined") return;
  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
  const toast = (m, k) => (typeof window.arcToast === "function" ? window.arcToast(m, k) : console.log(m));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const API = "/api/social";
  const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

  // ---- messages: must match api/social.mjs byte for byte ----
  const KEYS = ["description", "website", "twitter", "telegram", "discord", "banner"];
  const profileHash = (p) => ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, p[k] || ""])))));
  const profileMessage = (coin, issued, p) => `ARCIRCLE PAD — update coin profile\nCoin: ${lc(coin)}\nIssued: ${issued}\nContent: ${profileHash(p)}`;
  const xMessage = (wallet, handle, issued) => `ARCIRCLE PAD — verify X account\nX: @${handle}\nWallet: ${lc(wallet)}\nIssued: ${issued}`;
  const xCode = (sig) => "ARC-" + ethers.keccak256(sig).slice(2, 10).toUpperCase();
  const voteMessage = (coin, side, day) => `ARCIRCLE PAD — daily sentiment\nCoin: ${lc(coin)}\nVote: ${side === "bull" ? "Bullish" : "Bearish"}\nDay: ${day} (UTC)`;

  const ICON = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 22.2l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z" class="cm-seal"/><path d="m8.2 12.2 2.6 2.6 5-5.2" class="cm-tick"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16l6-6 4 4 6-7"/><path d="M15 7h5v5"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l6 6 4-4 6 7"/><path d="M15 17h5v-5"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true" class="cm-fill"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg>',
  };

  // ---------------- data ----------------
  const CM = { enabled: null, byCoin: new Map(), cur: null, seq: 0, creatorsX: new Map(), creatorsAt: 0 };
  async function load(coin, { fresh = false } = {}) {
    coin = lc(coin);
    const have = CM.byCoin.get(coin);
    if (have && !fresh && Date.now() - have.at < 60e3 && have.wallet === lc(state.account)) return have.d;
    const seq = ++CM.seq;
    const q = `${API}?coin=${coin}${state.account ? `&wallet=${lc(state.account)}` : ""}`;
    let d = null;
    try { const r = await fetch(q, { cache: "no-store" }); d = await r.json(); } catch (e) { d = null; }
    if (!d) return null;
    CM.enabled = !!d.enabled;
    if (d.enabled && !d.error) CM.byCoin.set(coin, { d, at: Date.now(), wallet: lc(state.account) });
    return seq === CM.seq || lc(APC.token) === coin ? d : null;
  }
  const curData = () => { const c = APC.l && CM.byCoin.get(lc(APC.l.token)); return c ? c.d : null; };
  const isCreator = () => { const d = curData(); return !!(d && state.account && lc(state.account) === lc(d.creator)); };

  // ---------------- profile override ----------------
  const LINKS = ["description", "website", "twitter", "telegram", "discord"];
  function applyProfile(l, p) {
    if (!l) return;
    if (!l.__chain) l.__chain = Object.fromEntries(LINKS.map((k) => [k, l[k] || ""]));
    for (const k of LINKS) l[k] = p ? p[k] || "" : l.__chain[k];
  }

  // ---------------- decorate the coin page ----------------
  function decorate() {
    const panel = $("bp-panel-coin");
    const d = curData();
    if (!panel) return;
    const on = !!(d && CM.enabled);
    // banner
    let ban = $("apc-banner");
    const bsrc = on && d.profile && /^data:image\/(webp|jpeg|png);base64,/.test(d.profile.banner || "") ? d.profile.banner : "";
    if (bsrc) {
      if (!ban) {
        ban = document.createElement("div"); ban.id = "apc-banner"; ban.className = "apc-banner";
        const head = panel.querySelector(".ac2-head"); head.parentNode.insertBefore(ban, head);
      }
      if (ban.dataset.src !== bsrc.slice(-40)) { ban.innerHTML = `<img src="${bsrc}" alt="">`; ban.dataset.src = bsrc.slice(-40); }
      ban.hidden = false;
    } else if (ban) ban.hidden = true;
    // verified X badge (name row + about)
    const x = on && d.creatorX ? d.creatorX : null;
    const row = panel.querySelector(".ac2-name-row");
    let xb = $("apc-xbadge");
    if (x && row) {
      if (!xb) { xb = document.createElement("a"); xb.id = "apc-xbadge"; xb.className = "cm-xbadge"; xb.target = "_blank"; xb.rel = "noopener"; row.appendChild(xb); }
      xb.href = `https://x.com/${encodeURIComponent(x.handle)}`;
      xb.title = tr("Creator verified on X");
      xb.innerHTML = `${ICON.check}<span data-no-i18n>@${esc(x.handle)}</span>`;
      xb.hidden = false;
    } else if (xb) xb.hidden = true;
    const about = $("apc-about-creator");
    if (about) {
      let ab = about.querySelector(".cm-xbadge");
      if (x) {
        if (!ab) { ab = document.createElement("a"); ab.className = "cm-xbadge cm-xbadge-sm"; ab.target = "_blank"; ab.rel = "noopener"; about.appendChild(ab); }
        ab.href = x.tweetUrl || `https://x.com/${encodeURIComponent(x.handle)}`;
        ab.innerHTML = `${ICON.check}<span data-no-i18n>@${esc(x.handle)}</span>`;
      } else if (ab) ab.remove();
    }
    // "updated by the creator" note in the Links card
    const links = $("apc-links");
    if (links) {
      let note = links.querySelector(".cm-edited");
      if (on && d.profile && d.profile.updatedAt) {
        if (!note) { note = document.createElement("p"); note.className = "cm-edited"; links.appendChild(note); }
        const ago = typeof window.ac2Ago === "function" ? window.ac2Ago(Math.floor(d.profile.updatedAt / 1000)) : "";
        note.innerHTML = `${ICON.pencil}<span>Profile updated by the creator</span>${ago ? `<span class="cm-dot">·</span><span>${esc(ago)}</span>` : ""}`;
      } else if (note) note.remove();
    }
    // edit button (creator only)
    const ca = panel.querySelector(".ac2-ca-row");
    let eb = $("apc-edit");
    if (on && isCreator() && ca) {
      if (!eb) {
        eb = document.createElement("button"); eb.type = "button"; eb.id = "apc-edit"; eb.className = "ac2-chip-btn cm-edit-btn";
        eb.innerHTML = `${ICON.pencil}<span>Edit coin info</span>`;
        eb.addEventListener("click", () => openEditor());
        ca.appendChild(eb);
      }
      eb.hidden = false;
    } else if (eb) eb.hidden = true;
    sentiment(on ? d : null);
    checklist(on ? d : null);
  }

  // ---------------- creator onboarding checklist ----------------
  // Shown to the creator only, right under the coin header, until every step
  // is done or they close it: banner → X → share the launch → first votes
  // (→ lock part of the supply, when the lock contract is live).
  const ckKey = (coin, k) => `arcircle.ck.${lc(coin)}.${k}`;
  const ckGet = (coin, k) => { try { return localStorage.getItem(ckKey(coin, k)) === "1"; } catch (e) { return false; } };
  const ckSet = (coin, k) => { try { localStorage.setItem(ckKey(coin, k), "1"); } catch (e) { /* ignore */ } };
  const CK_ICON = {
    banner: ICON.image, x: ICON.x,
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/></svg>',
    vote: ICON.up,
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
  };
  let ckLockState = { coin: null, locked: false };
  function checklist(d) {
    const panel = $("bp-panel-coin");
    let card = $("apc-checklist");
    const coin = APC.l && APC.l.token;
    if (!d || !coin || !isCreator() || ckGet(coin, "closed")) { if (card) card.remove(); return; }
    const s = d.sentiment || { today: { bull: 0, bear: 0 }, week: { bull: 0, bear: 0 } };
    const lockOn = typeof CONFIG !== "undefined" && CONFIG.ARCLOCK_ADDRESS && window.arcLock;
    if (lockOn && ckLockState.coin !== lc(coin)) {
      ckLockState = { coin: lc(coin), locked: false };
      window.arcLock.locksOf(coin).then((locks) => { ckLockState.locked = window.arcLock.activeByCreator(locks, APC.l.creator).total > 0n; checklist(curData()); }).catch(() => {});
    }
    const steps = [
      { k: "banner", t: "Add a banner", s: "Give your coin page a face.", done: !!(d.profile && d.profile.banner), act: "Add banner" },
      { k: "x", t: "Verify your X account", s: "A blue check next to every coin you launch.", done: !!d.creatorX, act: "Verify" },
      { k: "share", t: "Share your launch", s: "It's already posted in @arcircle_launch — pass it on.", done: ckGet(coin, "share"), act: "Share" },
      { k: "vote", t: "Ask for the first votes", s: "Invite holders to vote Bullish or Bearish today.", done: s.week.bull + s.week.bear + s.today.bull + s.today.bear > 0, act: "Ask" },
    ];
    if (lockOn) steps.push({ k: "lock", t: "Lock part of your supply", s: "The strongest trust signal a creator can give.", done: ckLockState.locked, act: "Lock" });
    const done = steps.filter((x) => x.done).length;
    if (done === steps.length) {
      if (card && !card.classList.contains("ck-complete")) { card.classList.add("ck-complete"); setTimeout(() => { if (card) card.remove(); ckSet(coin, "closed"); }, 2600); }
      else if (!card) ckSet(coin, "closed");
      if (card) card.querySelector(".ck-title").textContent = tr("All set — your coin is ready for the spotlight.");
      return;
    }
    if (!card) {
      card = document.createElement("section");
      card.id = "apc-checklist"; card.className = "ck";
      const head = panel.querySelector(".ac2-head");
      head.insertAdjacentElement("afterend", card);
      card.addEventListener("click", (e) => {
        const b = e.target.closest("[data-ck]");
        if (e.target.closest("[data-ck-close]")) { ckSet(APC.l.token, "closed"); card.remove(); return; }
        if (!b) return;
        const k = b.dataset.ck, sym = APC.l.symbol || "";
        if (k === "banner") openEditor("info");
        else if (k === "x") openEditor("x");
        else if (k === "lock") { const lb = $("apc-lockbtn"); if (lb) lb.click(); }
        else if (k === "share") {
          ckSet(APC.l.token, "share");
          const url = `https://www.arcircle.app/c/${APC.l.token}`;
          window.open(`https://x.com/intent/post?text=${encodeURIComponent(`$${sym} is live on ArcPad — a real Uniswap v4 pool on Circle's Arc 💚`)}&url=${encodeURIComponent(url)}&via=HOMEonRobinhood`, "_blank", "noopener,width=600,height=560");
          checklist(curData());
        } else if (k === "vote") {
          const url = `https://www.arcircle.app/c/${APC.l.token}`;
          window.open(`https://x.com/intent/post?text=${encodeURIComponent(`Bullish or bearish on $${sym}? Cast today's vote on ArcPad 💚`)}&url=${encodeURIComponent(url)}`, "_blank", "noopener,width=600,height=560");
        }
      });
    }
    const pct = Math.round((done / steps.length) * 100);
    card.innerHTML = `<div class="ck-head"><div class="ck-ring" style="--ck-p:${pct}%"><span data-no-i18n>${done}/${steps.length}</span></div>
        <div><h3 class="ck-title">Get your coin ready</h3><p>Each step takes under a minute and helps buyers trust your coin.</p></div>
        <button type="button" class="ck-x" data-ck-close aria-label="Close">${ICON.close}</button></div>
      <ol class="ck-steps">${steps.map((x) => `<li class="${x.done ? "done" : ""}"><span class="ck-ico">${x.done ? ICON.check : CK_ICON[x.k]}</span>
        <span class="ck-txt"><strong>${x.t}</strong><small>${x.s}</small></span>${x.done ? "" : `<button type="button" class="cm-btn" data-ck="${x.k}">${x.act}</button>`}</li>`).join("")}</ol>`;
  }

  // ---------------- sentiment card ----------------
  function sentiment(d) {
    const side = document.querySelector("#bp-panel-coin .ac2-side");
    let card = $("apc-sent");
    if (!d) { if (card) card.hidden = true; return; }
    if (!card && side) {
      card = document.createElement("div");
      card.id = "apc-sent"; card.className = "ac2-card cm-sent";
      card.innerHTML = `<div class="cm-sent-head"><h3>Community sentiment</h3><span class="cm-sent-when">Today (UTC)</span></div>
        <div class="cm-sent-bar" role="img"><span class="cm-bull"></span><span class="cm-bear"></span></div>
        <div class="cm-sent-legend"><span class="cm-l-bull"><b></b> <span>Bullish</span></span><span class="cm-l-n"><b></b> <span>votes</span></span><span class="cm-l-bear"><span>Bearish</span> <b></b></span></div>
        <div class="cm-sent-btns"><button type="button" data-vote="bull" class="cm-vote cm-vote-bull">${ICON.up}<span>Bullish</span></button><button type="button" data-vote="bear" class="cm-vote cm-vote-bear">${ICON.down}<span>Bearish</span></button></div>
        <p class="cm-sent-sub"></p>
        <p class="cm-sent-note">One vote per wallet per coin each day. You sign a message — free, no transaction.</p>`;
      const swap = $("apc-swap");
      if (swap && swap.nextSibling) side.insertBefore(card, swap.nextSibling); else side.appendChild(card);
      card.addEventListener("click", (e) => { const b = e.target.closest("[data-vote]"); if (b) vote(b.getAttribute("data-vote")); });
    }
    if (!card) return;
    card.hidden = false;
    const t = d.sentiment.today, n = t.bull + t.bear, bullPct = n ? Math.round((t.bull / n) * 100) : 50;
    card.classList.toggle("is-empty", !n);
    card.querySelector(".cm-bull").style.width = (n ? bullPct : 50) + "%";
    card.querySelector(".cm-bear").style.width = (n ? 100 - bullPct : 50) + "%";
    card.querySelector(".cm-sent-bar").setAttribute("aria-label", n ? `${bullPct}% bullish of ${n} votes today` : "No votes yet today");
    card.querySelector(".cm-l-bull b").textContent = n ? bullPct + "%" : "—";
    card.querySelector(".cm-l-bear b").textContent = n ? 100 - bullPct + "%" : "—";
    card.querySelector(".cm-l-n b").textContent = n;
    card.querySelector(".cm-l-n span").textContent = n === 1 ? "vote" : "votes";
    const hn = t.hbull + t.hbear, w = d.sentiment.week, wn = w.bull + w.bear;
    const sub = [];
    if (!n) sub.push('<span>No votes yet today — be the first.</span>');
    if (hn) sub.push(`<span class="cm-sub-item"><span>Holders</span> <b>${Math.round((t.hbull / hn) * 100)}%</b> <span>bullish</span></span>`);
    if (wn > n) sub.push(`<span class="cm-sub-item"><span>7 days</span> <b>${Math.round((w.bull / wn) * 100)}%</b> <span>bullish</span></span>`);
    card.querySelector(".cm-sent-sub").innerHTML = sub.join('<span class="cm-dot">·</span>');
    card.querySelectorAll("[data-vote]").forEach((b) => {
      const mine = d.myVote === b.getAttribute("data-vote");
      b.classList.toggle("is-mine", mine);
      b.disabled = !!d.myVote || CM.voting;
      b.setAttribute("aria-pressed", mine ? "true" : "false");
    });
    card.classList.toggle("has-voted", !!d.myVote);
  }

  async function vote(side) {
    const d = curData();
    if (!d || CM.voting) return;
    if (!state.account || !state.signer) { if (typeof connectWallet === "function") connectWallet(); return; }
    CM.voting = true; sentiment(d);
    const card = $("apc-sent");
    try {
      const coin = lc(APC.l.token), wallet = lc(state.account);
      const fresh = await load(coin, { fresh: true }) || d;
      if (fresh.myVote) { toast(tr("You already voted on this coin today"), "warn"); return; }
      const day = fresh.day;
      const signature = await state.signer.signMessage(voteMessage(coin, side, day));
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "vote", coin, wallet, side, day, signature }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok && !j.already) throw new Error(j.error || `HTTP ${r.status}`);
      const cur = curData() || fresh;
      if (j.today) cur.sentiment.today = j.today;
      cur.myVote = j.already ? cur.myVote || side : side;
      if (card) { card.classList.remove("cm-voted-anim"); void card.offsetWidth; card.classList.add("cm-voted-anim"); }
      if (typeof window.arcFeedback === "function") window.arcFeedback(side === "bull" ? "buy" : "sell");
      toast(tr(side === "bull" ? "Voted Bullish — thanks!" : "Voted Bearish — thanks!"));
    } catch (e) {
      const msg = e && (e.code === "ACTION_REJECTED" || /reject|denied/i.test(e.message || "")) ? "Signature cancelled" : (e && e.message) || "Vote failed";
      toast(tr(msg), "warn");
    } finally { CM.voting = false; sentiment(curData()); }
  }

  // ---------------- editor modal ----------------
  let modal = null;
  function normLink(k, v) {
    v = String(v || "").trim();
    if (!v) return "";
    const h = v.replace(/^@/, "");
    if (k === "twitter" && HANDLE.test(h)) return `https://x.com/${h}`;
    if (k === "telegram" && /^[A-Za-z0-9_]{4,32}$/.test(h)) return `https://t.me/${h}`;
    if (/^http:\/\//i.test(v)) v = "https://" + v.slice(7);
    if (!/^https:\/\//i.test(v)) v = "https://" + v;
    return v;
  }
  function field(id, label, ph, val, extra = "") {
    return `<label class="cm-field"><span>${label}</span><input id="${id}" type="text" autocomplete="off" spellcheck="false" placeholder="${ph}" value="${esc(val || "")}" ${extra}></label>`;
  }
  function openEditor(tab) {
    const d = curData();
    if (!d || !APC.l) return;
    const l = APC.l, chain = l.__chain || l, p = d.profile || null;
    const cur = (k) => (p ? p[k] || "" : chain[k] || "");
    closeEditor();
    modal = document.createElement("div");
    modal.className = "cm-modal";
    modal.innerHTML = `<div class="cm-backdrop" data-close></div>
      <div class="cm-dialog" role="dialog" aria-modal="true" aria-labelledby="cm-title">
        <div class="cm-dhead">
          <div><h2 id="cm-title">Edit <span data-no-i18n>$${esc(l.symbol || "")}</span></h2><p>Changes show on the coin page right away. Only the wallet that launched this coin can save.</p></div>
          <button type="button" class="cm-x" data-close aria-label="Close">${ICON.close}</button>
        </div>
        <div class="cm-tabs" role="tablist">
          <button type="button" role="tab" data-tab="info" class="on">Coin info</button>
          <button type="button" role="tab" data-tab="x">${ICON.x}<span>Verify X</span>${d.creatorX ? `<i class="cm-tab-ok">${ICON.check}</i>` : ""}</button>
        </div>
        <div class="cm-pane" data-pane="info">
          <div class="cm-banner-edit" id="cm-banner">
            <div class="cm-banner-prev" id="cm-banner-prev">${cur("banner") ? `<img src="${cur("banner")}" alt="">` : `<span class="cm-banner-empty">${ICON.image}<span>Banner · 1500 × 500</span></span>`}</div>
            <div class="cm-banner-acts"><label class="cm-btn cm-btn-ghost"><input type="file" id="cm-banner-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>${ICON.image}<span>Upload banner</span></label>
              <button type="button" class="cm-btn cm-btn-ghost" id="cm-banner-rm"${cur("banner") ? "" : " hidden"}>Remove</button></div>
          </div>
          <label class="cm-field"><span>Description <em id="cm-desc-n"></em></span><textarea id="cm-desc" rows="4" maxlength="600" placeholder="What is this coin about?">${esc(cur("description"))}</textarea></label>
          <div class="cm-grid">
            ${field("cm-website", "Website", "https://…", cur("website"))}
            ${field("cm-twitter", "X", "@handle or x.com/…", cur("twitter"))}
            ${field("cm-telegram", "Telegram", "@group or t.me/…", cur("telegram"))}
            ${field("cm-discord", "Discord", "discord.gg/…", cur("discord"))}
          </div>
          <div class="cm-status" id="cm-info-status" aria-live="polite"></div>
          <div class="cm-foot"><span class="cm-hint">Free — you sign a message, no transaction.</span><button type="button" class="cm-btn cm-btn-primary" id="cm-save">Sign &amp; save</button></div>
        </div>
        <div class="cm-pane" data-pane="x" hidden></div>
      </div>`;
    document.body.appendChild(modal);
    document.documentElement.classList.add("cm-lock");
    requestAnimationFrame(() => modal.classList.add("in"));
    modal.__banner = cur("banner");
    modal.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) closeEditor();
      const t = e.target.closest("[data-tab]");
      if (t) showTab(t.getAttribute("data-tab"));
    });
    modal.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEditor(); });
    const desc = modal.querySelector("#cm-desc"), n = modal.querySelector("#cm-desc-n");
    const count = () => { n.textContent = `${desc.value.length} / 600`; };
    desc.addEventListener("input", count); count();
    modal.querySelector("#cm-banner-file").addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; if (f) pickBanner(f); e.target.value = ""; });
    modal.querySelector("#cm-banner-rm").addEventListener("click", () => { modal.__banner = ""; paintBanner(); });
    modal.querySelector("#cm-save").addEventListener("click", saveInfo);
    renderX();
    if (tab === "x") showTab("x");
    setTimeout(() => { const f = modal && modal.querySelector(tab === "x" ? "#cm-x-handle" : "#cm-desc"); if (f) f.focus(); }, 60);
  }
  function showTab(t) {
    if (!modal) return;
    modal.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b.getAttribute("data-tab") === t));
    modal.querySelectorAll("[data-pane]").forEach((p) => { p.hidden = p.getAttribute("data-pane") !== t; });
  }
  function closeEditor() {
    if (!modal) return;
    const m = modal; modal = null;
    document.documentElement.classList.remove("cm-lock");
    m.classList.remove("in"); setTimeout(() => m.remove(), 220);
  }
  function paintBanner() {
    if (!modal) return;
    const b = modal.__banner;
    modal.querySelector("#cm-banner-prev").innerHTML = b ? `<img src="${b}" alt="">` : `<span class="cm-banner-empty">${ICON.image}<span>Banner · 1500 × 500</span></span>`;
    modal.querySelector("#cm-banner-rm").hidden = !b;
  }
  /// Any picture → 1500×500 WebP (cover crop), shrunk until it's under ~280 KB.
  function pickBanner(file) {
    const st = modal.querySelector("#cm-info-status");
    if (!/^image\//.test(file.type)) { st.className = "cm-status bad"; st.textContent = tr("That isn't an image."); return; }
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let W = 1500, H = 500, q = 0.84, out = "";
      for (let i = 0; i < 6; i++) {
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const g = c.getContext("2d");
        const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
        g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
        out = c.toDataURL("image/webp", q);
        if (!/^data:image\/webp/.test(out)) out = c.toDataURL("image/jpeg", q);
        if (out.length < 380_000) break;
        q = Math.max(0.5, q - 0.1); if (i >= 2) { W = Math.round(W * 0.8); H = Math.round(H * 0.8); }
      }
      if (!modal) return;
      if (out.length >= 400_000) { st.className = "cm-status bad"; st.textContent = tr("That image is too detailed — try a simpler one."); return; }
      modal.__banner = out; paintBanner(); st.textContent = "";
    };
    img.onerror = () => { URL.revokeObjectURL(url); st.className = "cm-status bad"; st.textContent = tr("Couldn't read that image."); };
    img.src = url;
  }
  async function saveInfo() {
    if (!modal) return;
    const st = modal.querySelector("#cm-info-status"), btn = modal.querySelector("#cm-save");
    const say = (cls, msg) => { st.className = "cm-status " + cls; st.textContent = tr(msg); };
    if (!state.account || !state.signer) { if (typeof connectWallet === "function") connectWallet(); return; }
    if (!isCreator()) return say("bad", "Connect the wallet that launched this coin.");
    const p = {
      description: modal.querySelector("#cm-desc").value.trim(),
      website: normLink("website", modal.querySelector("#cm-website").value),
      twitter: normLink("twitter", modal.querySelector("#cm-twitter").value),
      telegram: normLink("telegram", modal.querySelector("#cm-telegram").value),
      discord: normLink("discord", modal.querySelector("#cm-discord").value),
      banner: modal.__banner || "",
    };
    btn.disabled = true;
    try {
      say("wait", "Confirm the signature in your wallet…");
      const coin = lc(APC.l.token), issued = new Date().toISOString();
      const signature = await state.signer.signMessage(profileMessage(coin, issued, p));
      say("wait", "Saving…");
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "profile", coin, profile: p, issued, signature }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const d = curData(); if (d) d.profile = j.profile;
      applyProfile(APC.l, j.profile);
      if (typeof apcRenderHeader === "function") apcRenderHeader();
      say("ok", "Saved — the coin page is updated.");
      toast(tr("Coin info updated"));
      setTimeout(closeEditor, 900);
    } catch (e) {
      say("bad", e && (e.code === "ACTION_REJECTED" || /reject|denied/i.test(e.message || "")) ? "Signature cancelled." : (e && e.message) || "Save failed.");
    } finally { btn.disabled = false; }
  }

  // ---------------- X verification ----------------
  const pendKey = () => `arcircle.xverify.${lc(state.account)}`;
  const getPend = () => { try { return JSON.parse(localStorage.getItem(pendKey()) || "null"); } catch (e) { return null; } };
  const setPend = (v) => { try { v ? localStorage.setItem(pendKey(), JSON.stringify(v)) : localStorage.removeItem(pendKey()); } catch (e) { /* private mode */ } };
  function tweetText(code) {
    return `Verifying my ArcPad creator wallet ${short(state.account)} on ARCIRCLE PAD 💚\n\n${code}\n\narcircle.app/arc`;
  }
  function renderX() {
    if (!modal) return;
    const pane = modal.querySelector('[data-pane="x"]'), d = curData();
    const x = d && d.creatorX, pend = getPend();
    const verified = x ? `<div class="cm-xok">${ICON.check}<div><strong>Verified as <span data-no-i18n>@${esc(x.handle)}</span></strong><small>The badge shows on every coin this wallet launches.</small></div>${x.tweetUrl ? `<a href="${esc(x.tweetUrl)}" target="_blank" rel="noopener">View post ↗</a>` : ""}</div>` : "";
    const step = (n, title, body, on, done) => `<li class="cm-step${on ? " on" : ""}${done ? " done" : ""}"><span class="cm-step-n">${done ? ICON.check : n}</span><div><strong>${title}</strong>${body}</div></li>`;
    const code = pend && pend.signature ? xCode(pend.signature) : "";
    pane.innerHTML = `${verified}
      <p class="cm-lede">${x ? "Linked a different account? Verify again to replace it." : "Link your X account to this creator wallet. Buyers see a verified badge next to your coins."}</p>
      <ol class="cm-steps">
        ${step(1, "Sign with your wallet", `<div class="cm-row">${field("cm-x-handle", "", "@yourhandle", pend ? "@" + pend.handle : "", 'aria-label="X handle"')}<button type="button" class="cm-btn" id="cm-x-sign">${pend ? "Sign again" : "Sign"}</button></div>`, !pend, !!pend)}
        ${step(2, "Post the code on X", pend ? `<div class="cm-post"><pre data-no-i18n>${esc(tweetText(code))}</pre><div class="cm-row"><a class="cm-btn cm-btn-x" id="cm-x-post" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(tweetText(code))}">${ICON.x}<span>Post on X</span></a><button type="button" class="cm-btn cm-btn-ghost" id="cm-x-copy">Copy text</button></div></div>` : "<small>Your one-time code appears here after signing.</small>", !!pend, false)}
        ${step(3, "Paste the link to your post", pend ? `<div class="cm-row">${field("cm-x-url", "", "https://x.com/…/status/…", "", 'aria-label="Post link"')}<button type="button" class="cm-btn cm-btn-primary" id="cm-x-verify">Verify</button></div>` : "", !!pend, false)}
      </ol>
      <div class="cm-status" id="cm-x-status" aria-live="polite"></div>`;
    const st = pane.querySelector("#cm-x-status");
    const say = (cls, msg) => { st.className = "cm-status " + cls; st.textContent = tr(msg); };
    pane.querySelector("#cm-x-sign").addEventListener("click", async () => {
      if (!state.account || !state.signer) { if (typeof connectWallet === "function") connectWallet(); return; }
      const handle = pane.querySelector("#cm-x-handle").value.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "").split(/[/?#]/)[0];
      if (!HANDLE.test(handle)) return say("bad", "Enter your X handle, like @arcircle.");
      try {
        say("wait", "Confirm the signature in your wallet…");
        const issued = new Date().toISOString();
        const signature = await state.signer.signMessage(xMessage(state.account, handle, issued));
        setPend({ handle, issued, signature });
        renderX();
      } catch (e) { say("bad", e && (e.code === "ACTION_REJECTED" || /reject|denied/i.test(e.message || "")) ? "Signature cancelled." : "Signing failed."); }
    });
    const copy = pane.querySelector("#cm-x-copy");
    if (copy) copy.addEventListener("click", () => {
      (navigator.clipboard ? navigator.clipboard.writeText(tweetText(code)) : Promise.reject()).then(() => { copy.textContent = tr("Copied"); setTimeout(() => { copy.textContent = tr("Copy text"); }, 1400); }, () => {});
    });
    const ver = pane.querySelector("#cm-x-verify");
    if (ver) ver.addEventListener("click", async () => {
      const url = pane.querySelector("#cm-x-url").value.trim();
      if (!/\/status(es)?\/\d+/.test(url)) return say("bad", "Paste the link to your post (x.com/…/status/…).");
      ver.disabled = true;
      try {
        say("wait", "Checking your post on X…");
        const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "x-verify", wallet: lc(state.account), handle: pend.handle, issued: pend.issued, signature: pend.signature, tweetUrl: url }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setPend(null);
        const d2 = curData(); if (d2 && lc(d2.creator) === lc(state.account)) d2.creatorX = { handle: j.handle, tweetUrl: j.tweetUrl, verifiedAt: Date.now() };
        CM.creatorsX.set(lc(state.account), j.handle);
        toast(tr("X account verified"));
        if (typeof window.arcFeedback === "function") window.arcFeedback("milestone");
        renderX(); decorate();
        const tab = modal && modal.querySelector('[data-tab="x"]'); if (tab && !tab.querySelector(".cm-tab-ok")) tab.insertAdjacentHTML("beforeend", `<i class="cm-tab-ok">${ICON.check}</i>`);
      } catch (e) { say("bad", (e && e.message) || "Verification failed."); } finally { ver.disabled = false; }
    });
  }

  // ---------------- creators leaderboard badges ----------------
  async function creatorsMap(addrs) {
    const need = addrs.filter((a) => !CM.creatorsX.has(a));
    if (need.length && (Date.now() - CM.creatorsAt > 30e3 || need.length)) {
      CM.creatorsAt = Date.now();
      try {
        const r = await fetch(`${API}?creators=${need.slice(0, 60).join(",")}`);
        const j = await r.json();
        if (!j.enabled) { CM.enabled = false; return; }
        need.forEach((a) => CM.creatorsX.set(a, (j.x || {})[a] || ""));
      } catch (e) { /* offline */ }
    }
  }
  let crBusy = false;
  async function badgeCreators() {
    const body = $("cr-body");
    if (!body || crBusy || CM.enabled === false) return;
    const rows = [...body.querySelectorAll(".cr-who a[href*='/address/']")];
    if (!rows.length) return;
    crBusy = true;
    try {
      const addrs = [...new Set(rows.map((a) => lc((a.getAttribute("href").match(/0x[0-9a-fA-F]{40}/) || [])[0])).filter(Boolean))];
      await creatorsMap(addrs);
      rows.forEach((a) => {
        const addr = lc((a.getAttribute("href").match(/0x[0-9a-fA-F]{40}/) || [])[0]), h = CM.creatorsX.get(addr);
        const cell = a.parentElement;
        if (h && !cell.querySelector(".cm-xbadge")) cell.insertAdjacentHTML("beforeend", ` <a class="cm-xbadge cm-xbadge-sm" href="https://x.com/${encodeURIComponent(h)}" target="_blank" rel="noopener">${ICON.check}<span data-no-i18n>@${esc(h)}</span></a>`);
      });
    } finally { crBusy = false; }
  }

  // ---------------- wiring ----------------
  async function refresh(fresh) {
    if (!APC.l) return;
    const coin = lc(APC.l.token);
    const d = await load(coin, { fresh });
    if (!d || lc(APC.l && APC.l.token) !== coin) return;
    if (!d.enabled) { decorate(); return; }
    const before = JSON.stringify(LINKS.map((k) => APC.l[k]));
    applyProfile(APC.l, d.profile);
    if (JSON.stringify(LINKS.map((k) => APC.l[k])) !== before && typeof apcRenderHeader === "function") apcRenderHeader();
    else decorate();
    try { document.dispatchEvent(new CustomEvent("arc:community", { detail: { coin } })); } catch (e) { /* old browser */ }
  }
  if (typeof apcRenderHeader === "function") {
    const orig = apcRenderHeader;
    apcRenderHeader = function () {
      const d = APC.l && CM.byCoin.get(lc(APC.l.token));
      if (d && d.d.enabled) applyProfile(APC.l, d.d.profile);
      orig.apply(this, arguments);
      try {
        decorate();
        if (APC.l && CM.cur !== lc(APC.l.token)) { CM.cur = lc(APC.l.token); refresh(false); }
      } catch (e) { console.warn("community", e); }
    };
  }
  if (typeof refreshAccountDependentViews === "function") {
    const origR = refreshAccountDependentViews;
    refreshAccountDependentViews = function () {
      origR.apply(this, arguments);
      try { const p = $("bp-panel-coin"); if (APC.l && p && p.classList.contains("active")) refresh(true); } catch (e) { /* ignore */ }
    };
  }
  const cr = $("cr-body");
  if (cr) new MutationObserver(() => { badgeCreators(); }).observe(cr, { childList: true });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal) closeEditor(); });
  window.arcCommunity = { open: openEditor, refresh: () => refresh(true), data: () => curData() };
})();
