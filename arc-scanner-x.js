/* global ethers, CONFIG, state, connectWallet, ensureArcForWrite */
// arc-scanner-x.js — Token Scanner v3 tools, on top of arc-scanner.js (window.arcScanner).
//
// Three tiers (the server keeps the count, api/_scan-pro.mjs):
//   Free — every check and the score, plus the dry-run trades, pre-buy and the deployer. No login.
//   Plus — sign in with a wallet: 3 free unlocks a day per wallet, then 1,000 $ARCIRCLE burned per unlock.
//   Pro  — sign in + post one scan on X a day: 1 free unlock a day, then 2,000 $ARCIRCLE burned per unlock.
//   One unlock = one tool for one token (or wallet, or "all") for 24 hours.
//   While we test, every wallet gets the free daily unlocks; later they're planned for wallets
//   holding 100,000 $ARCIRCLE.
//
// Tools on a scan result (#asc-x):  Dry-run trades · Pre-buy (Free)
//   Stress test · What changed · Price chart · Linked wallets · Who trades · Alerts · Project note (Plus)
//   ARCIA's take (Pro).  Header actions: Freeze a report (Plus), live embed card (Pro).
// Before a scan (#asc-intro):  Plans · New on Arc (Plus) · Wallet approvals (Plus) · Batch scan and
//   webhooks (Pro) · search by name (Pro, in the address box).
(function () {
  "use strict";
  const A = window.arcScanner;
  const panel = document.getElementById("bp-panel-scanner");
  if (!A || !panel || typeof ethers === "undefined") return;
  const { K, tr, esc, ex, short, lc, fetchJson, reduce, haptic, toast, ICON, isAddr } = A;
  const $ = (id) => document.getElementById(id);
  const now = () => Math.floor(Date.now() / 1000);
  const ARCIRCLE = lc(CONFIG.ARCIRCLE_TOKEN);
  const DEAD = "0x000000000000000000000000000000000000dEaD";
  const SESS = "arcircle.scanner.sess.v3", CMP = "arcircle.scanner.cmp.v3";
  const TIER = { p2: { name: "Plus", free: 3, burn: 1000 }, p3: { name: "Pro", free: 1, burn: 2000 } };
  const FEAT = {
    stress: ["p2", "Stress test"], diff: ["p2", "What changed"], chart: ["p2", "Price chart"], linked: ["p2", "Linked wallets"], traders: ["p2", "Who trades"],
    alerts: ["p2", "Alert rules"], note: ["p2", "Project note"], report: ["p2", "Frozen report"], approvals: ["p2", "Wallet approvals"], feed: ["p2", "New on Arc"],
    take: ["p3", "ARCIA's take"], search: ["p3", "Search by name"], embed: ["p3", "Live embed card"], batch: ["p3", "Batch scan"], webhook: ["p3", "Webhooks"],
  };
  const ls = { get: (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };

  // =====================================================================
  // account: wallet sign-in, today's free unlocks, what's open
  // =====================================================================
  const X = { w: null, s: null, exp: 0, ent: null };
  (function restore() { const o = ls.get(SESS); if (o && o.exp > now() + 60 && isAddr(o.w)) { X.w = lc(o.w); X.s = o.s; X.exp = o.exp; } })();
  const signedIn = () => !!(X.w && X.s && X.exp > now());
  async function post(body) {
    try { const r = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return await r.json().catch(() => ({ error: "bad answer" })); }
    catch { return { error: "Couldn't reach the server — try again." }; }
  }
  async function login() {
    if (signedIn() && (!state.account || lc(state.account) === X.w)) return true;
    if (!state.account && typeof connectWallet === "function") await connectWallet();
    if (!state.account || !state.signer) { toast(tr("Connect a wallet first.")); return false; }
    const w = lc(state.account), t = now();
    const m = await fetchJson(`/api/scan?msg=signin&w=${w}&t=${t}`, 8000);
    if (!m || !m.msg) { toast(tr("Couldn't reach the server — try again.")); return false; }
    let sig;
    try { sig = await state.signer.signMessage(m.msg); } catch { toast(tr("You cancelled in your wallet.")); return false; }
    const j = await post({ action: "auth", w, t, sig });
    if (!j.token) { toast(tr(j.error || "Sign-in failed.")); return false; }
    X.w = w; X.s = j.token; X.exp = j.exp; ls.set(SESS, { w, s: j.token, exp: j.exp });
    await refreshEnt();
    return true;
  }
  function logout() { X.w = X.s = null; X.exp = 0; X.ent = null; ls.set(SESS, null); paintAcct(); paintTools(); paintIntro(); }
  async function refreshEnt() {
    if (!signedIn()) { X.ent = null; paintAcct(); return null; }
    const j = await fetchJson(`/api/scan?ent=1&w=${X.w}&s=${encodeURIComponent(X.s)}`, 9000);
    if (j && j.day) X.ent = j; else if (j && j.need === "login") logout();
    paintAcct();
    return X.ent;
  }
  const has = (f, subj) => !FEAT[f] || !!(X.ent && (X.ent.unlocks || []).some((u) => u.f === f && u.s === lc(subj || "all") && u.exp > now()));
  const auth = () => `w=${X.w}&s=${encodeURIComponent(X.s || "")}`;

  // ---- the unlock flow: free today → (Pro: X post first) → burn ----
  async function unlock(f, subj) {
    subj = lc(subj || "all");
    if (has(f, subj)) return true;
    if (!(await login())) return false;
    let j = await post({ action: "unlock", w: X.w, s: X.s, f, subj });
    if (j.need === "login") { logout(); if (!(await login())) return false; j = await post({ action: "unlock", w: X.w, s: X.s, f, subj }); }
    if (j.ok) { X.ent = j.status || X.ent; await refreshEnt(); toast(tr(j.via === "free" ? "Unlocked for 24 hours — one of today's free unlocks." : "Unlocked for 24 hours.")); haptic("milestone"); return true; }
    if (j.need === "share") return shareFlow(f, subj);
    if (j.need === "burn") return burnFlow(f, subj, j.amount);
    toast(tr(j.error || "Couldn't unlock that.")); return false;
  }
  function modal(html) {
    const back = document.createElement("div");
    back.className = "ascx-modal-back"; back.innerHTML = `<div class="ascx-modal" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add("on"));
    const close = () => { back.classList.remove("on"); setTimeout(() => back.remove(), 200); };
    back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-mclose]")) close(); });
    return { el: back.querySelector(".ascx-modal"), close };
  }
  function shareFlow(f, subj) {
    return new Promise((resolve) => {
      const tok = A.state && A.state.addr ? A.state.addr : null;
      const link = `${location.origin}/s/${tok || ARCIRCLE}?by=${X.w}`;
      const text = tok && A.state.res ? `$${A.state.c.symbol} — scanned by ARCIRCLE: ${A.state.res.score}/100 · ${A.state.res.verdict.t}` : "Checking Arc tokens with the ARCIRCLE Token Scanner";
      const m = modal(`<h3>${esc(tr("Pro: post one scan on X today"))}</h3>
        <p>${esc(tr("Pro's free daily unlock needs one public post of a scan from your X account. The link carries your wallet, so the post counts for you."))}</p>
        <a class="ascx-btn pri" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}" target="_blank" rel="noopener">${esc(tr("Post on X"))} ↗</a>
        <label class="ascx-lbl">${esc(tr("Then paste the link to your post"))}<input type="url" placeholder="https://x.com/you/status/…" data-share-url></label>
        <p class="ascx-err" hidden></p>
        <div class="ascx-row"><button type="button" class="ascx-btn" data-mclose>${esc(tr("Cancel"))}</button><button type="button" class="ascx-btn pri" data-share-go>${esc(tr("Check my post"))}</button>
        <button type="button" class="ascx-btn ghost" data-share-burn>${esc(tr("Burn instead"))} (${TIER.p3.burn.toLocaleString("en-US")} $ARCIRCLE)</button></div>`);
      const err = m.el.querySelector(".ascx-err");
      m.el.querySelector("[data-share-go]").addEventListener("click", async (e) => {
        const btn = e.currentTarget; btn.disabled = true; err.hidden = true;
        const j = await post({ action: "share", w: X.w, s: X.s, url: m.el.querySelector("[data-share-url]").value.trim(), token: tok || "" });
        btn.disabled = false;
        if (!j.ok) { err.hidden = false; err.textContent = tr(j.error || "That didn't work."); return; }
        m.close();
        const u = await post({ action: "unlock", w: X.w, s: X.s, f, subj });
        if (u.ok) { await refreshEnt(); toast(tr("Unlocked for 24 hours.")); resolve(true); }
        else if (u.need === "burn") resolve(await burnFlow(f, subj, u.amount));
        else { toast(tr(u.error || "Couldn't unlock that.")); resolve(false); }
      });
      m.el.querySelector("[data-share-burn]").addEventListener("click", async () => { m.close(); resolve(await burnFlow(f, subj, TIER.p3.burn)); });
      m.el.querySelectorAll("[data-mclose]").forEach((b) => b.addEventListener("click", () => resolve(false)));
    });
  }
  function burnFlow(f, subj, amount) {
    return new Promise((resolve) => {
      const tier = TIER[FEAT[f][0]];
      amount = amount || tier.burn;
      const m = modal(`<h3>${esc(tr("Today's free unlocks are used"))}</h3>
        <p>${esc(tr("Unlock"))} <b>${esc(tr(FEAT[f][1]))}</b> ${esc(tr("for 24 hours by burning"))} <b data-no-i18n>${amount.toLocaleString("en-US")} $ARCIRCLE</b>. ${esc(tr("The tokens go to the dead address — nobody receives them."))}</p>
        <p class="ascx-note">${esc(tr("Free unlocks come back tomorrow (00:00 UTC)."))}</p>
        <p class="ascx-err" hidden></p>
        <div class="ascx-row"><button type="button" class="ascx-btn" data-mclose>${esc(tr("Not now"))}</button><button type="button" class="ascx-btn pri burn" data-burn-go>${esc(tr("Burn and unlock"))}</button></div>`);
      const err = m.el.querySelector(".ascx-err");
      m.el.querySelector("[data-mclose]").addEventListener("click", () => resolve(false));
      m.el.querySelector("[data-burn-go]").addEventListener("click", async (e) => {
        const btn = e.currentTarget; btn.disabled = true; err.hidden = true;
        try {
          if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
          if (!state.signer || lc(state.account) !== X.w) throw new Error(tr("Switch your wallet back to the one you signed in with."));
          const c = new ethers.Contract(ARCIRCLE, ["function transfer(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"], state.signer);
          const want = ethers.parseEther(String(amount));
          if ((await c.balanceOf(state.account)) < want) throw new Error(tr("Not enough $ARCIRCLE in this wallet."));
          btn.textContent = tr("Confirm in your wallet…");
          const tx = await c.transfer(DEAD, want);
          btn.textContent = tr("Burning…");
          await tx.wait();
          const j = await post({ action: "unlock", w: X.w, s: X.s, f, subj, burnTx: tx.hash });
          if (!j.ok) throw new Error(tr(j.error || "The burn went through but the unlock didn't — try again in a moment."));
          m.close(); await refreshEnt(); toast(tr("Burned — unlocked for 24 hours.")); haptic("milestone"); resolve(true);
        } catch (x) {
          btn.disabled = false; btn.textContent = tr("Burn and unlock");
          err.hidden = false; err.textContent = x && (x.code === "ACTION_REJECTED" || x.code === 4001) ? tr("You cancelled in your wallet.") : String((x && (x.shortMessage || x.message)) || x).slice(0, 160);
        }
      });
    });
  }

  // =====================================================================
  // the account strip and the plans
  // =====================================================================
  function tierBadge(t) { return `<em class="asc-tier t-${t}">${esc(TIER[t] ? TIER[t].name : "Free")}</em>`; }
  function paintAcct() {
    let box = $("asc-acct");
    if (!box) { box = document.createElement("div"); box.id = "asc-acct"; box.className = "asc-acct"; const ch = $("asc-chips"); if (ch) ch.insertAdjacentElement("afterend", box); else return; }
    const e = X.ent;
    box.innerHTML = signedIn()
      ? `<span class="asc-acct-w" data-no-i18n><i style="--h:${A.hueOf(X.w)}"></i>${short(X.w)}</span>
         <span class="asc-acct-q">${tierBadge("p2")} <b data-no-i18n>${e ? e.p2.left : "…"}/${TIER.p2.free}</b> ${esc(tr("free today"))}</span>
         <span class="asc-acct-q">${tierBadge("p3")} <b data-no-i18n>${e ? e.p3.left : "…"}/${TIER.p3.free}</b> ${esc(tr("free today"))}${e && !e.p3.shared ? ` <small>${esc(tr("after an X post"))}</small>` : ""}</span>
         ${e && e.unlocks && e.unlocks.length ? `<span class="asc-acct-u" title="${esc(e.unlocks.map((u) => `${tr(FEAT[u.f] ? FEAT[u.f][1] : u.f)} · ${u.s === "all" ? tr("all") : short(u.s)}`).join("\n"))}">${e.unlocks.length} ${esc(tr("open"))}</span>` : ""}
         <button type="button" class="asc-acct-out" data-xact="logout">${esc(tr("Sign out"))}</button>`
      : `<button type="button" class="asc-acct-in" data-xact="login"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16v11H4zM16 13h.01M4 7.5l12-3v3"/></svg>${esc(tr("Sign in for Plus & Pro"))}</button><span class="asc-acct-hint">${esc(tr("Every check and the score stay free."))}</span>`;
  }
  function plansHtml() {
    return `<div class="asc-card asc-plans" id="asc-plans">
      <h2>${esc(tr("Free, Plus and Pro"))} <span class="asc-ver sm">v4</span></h2>
      <div class="asc-plan-grid">
        <div class="asc-plan p1"><h3>${esc(tr("Free"))}</h3><p>${esc(tr("Every check, the score, critical flags and confidence. Dry-run trades at three sizes, pre-buy, the deployer's other tokens, same-code tokens, copycats. No login."))}</p></div>
        <div class="asc-plan p2"><h3>${tierBadge("p2")}</h3><p>${esc(tr("Sign in with a wallet. 3 free unlocks a day per wallet, then 1,000 $ARCIRCLE burned per unlock."))}</p>
          <ul>${["stress", "diff", "chart", "linked", "traders", "alerts", "note", "report", "approvals", "feed"].map((f) => `<li>${esc(tr(FEAT[f][1]))}</li>`).join("")}</ul></div>
        <div class="asc-plan p3"><h3>${tierBadge("p3")}</h3><p>${esc(tr("Sign in and post one scan on X a day: 1 free unlock a day, then 2,000 $ARCIRCLE burned per unlock."))}</p>
          <ul>${["take", "search", "embed", "batch", "webhook"].map((f) => `<li>${esc(tr(FEAT[f][1]))}</li>`).join("")}</ul></div>
      </div>
      <p class="asc-plan-note">${esc(tr("One unlock opens one tool for one token (or wallet) for 24 hours. Free unlocks reset every day at 00:00 UTC."))}</p>
      <p class="asc-plan-notice"><b>${esc(tr("Heads-up"))}</b> ${esc(tr("While we test, every wallet gets the free daily unlocks. Later, free unlocks are planned for wallets holding 100,000 $ARCIRCLE."))}</p>
    </div>`;
  }

  // =====================================================================
  // tool cards on a result
  // =====================================================================
  function lockHtml(f, subj) {
    const [t, name] = FEAT[f];
    const e = X.ent, left = e ? e[t].left : null;
    const how = !signedIn() ? tr("Sign in with your wallet to use it.")
      : left > 0 ? (t === "p3" && e && !e.p3.shared ? tr("Post one scan on X today, then it's free.") : `${left} ${tr("free unlocks left today.")}`)
      : `${tr("Burn")} ${TIER[t].burn.toLocaleString("en-US")} $ARCIRCLE ${tr("to unlock for 24 hours.")}`;
    return `<div class="ascx-lock"><span class="ascx-lock-i" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg></span>
      <b>${tierBadge(t)} ${esc(tr(name))}</b><small>${esc(how)}</small>
      <button type="button" class="ascx-btn pri" data-unlock="${f}" data-subj="${esc(subj || "all")}">${esc(tr(signedIn() ? "Unlock for 24 hours" : "Sign in and unlock"))}</button></div>`;
  }
  const CARDS = [
    ["sim", null, "Dry-run trades", "Buys and sells tried at three sizes, a brand-new buyer selling, and two sells in a row — nothing is signed or spent."],
    ["prebuy", null, "Before you buy", "What a buy would get you, how far it moves the price, and what selling straight back would return."],
    ["stress", "stress", "Stress test", "What the price would do if the biggest holders sold everything."],
    ["diff", "diff", "What changed", "Since the last scan of this token."],
    ["chart", "chart", "Price chart", "Price and volume per hour from the pool's own swaps on Arc, with events marked."],
    ["linked", "linked", "Linked wallets", "Wallets that look like one owner, and what they hold together."],
    ["traders", "traders", "Who trades", "The latest trades with the pool: how many wallets, and who makes most of them."],
    ["alerts", "alerts", "Alert rules", "Pick what you get told about while this token is on your watch list."],
    ["note", null, "From the project", "A note the token's owner, deployer or launchpad creator signed with their wallet."],
    ["take", "take", "ARCIA's take", "The result in plain words, and the one thing to check before buying."],
    ["solq", null, "Sell quotes", "Jupiter's price to sell 0.01%, 0.1% and 1% of the supply for SOL — nothing is signed or sent."],
  ];
  let lastAddr = null;
  // Robinhood Chain: the free tools only (Plus and Pro unlock against Arc's $ARCIRCLE and read Arc's pools)
  const cardsFor = (cur) => (cur && cur.ch === "sol" ? CARDS.filter(([k]) => k === "solq") : cur && cur.ch === "rh" ? CARDS.filter(([k]) => k === "sim" || k === "prebuy") : CARDS.filter(([k]) => k !== "solq"));
  const unfolded = new Set();
  // v4: tools that are open (free, or unlocked) are cards; locked ones are one short list under them
  function paintTools() {
    const box = $("asc-x"), cur = A.state;
    if (!box || !cur || !cur.res || cur.res.notToken) { if (box) box.innerHTML = ""; return; }
    const addr = lc(cur.addr), CARDS = cardsFor(cur);
    if (lastAddr !== (cur.ch || "arc") + addr) { box.innerHTML = ""; lastAddr = (cur.ch || "arc") + addr; }
    if (!box.querySelector(".ascx-grid")) {
      box.innerHTML = `<div class="ascx-head"><h3>${esc(tr("Tools"))}</h3><span>${esc(tr(cur.ch === "rh" || cur.ch === "sol" ? "Plus and Pro tools are on Arc for now." : "Free ones open right away; Plus and Pro ones open for 24 hours per token."))}</span></div>
        <div class="ascx-grid"></div><details class="ascx-locked" hidden><summary></summary><ul class="ascx-locklist"></ul></details>`;
    }
    const grid = box.querySelector(".ascx-grid"), lockBox = box.querySelector(".ascx-locked"), lockList = lockBox.querySelector(".ascx-locklist");
    const locked = [];
    CARDS.forEach(([k, f, t, sub]) => {
      if (f && !has(f, addr)) { locked.push([k, f, t, sub]); const old = grid.querySelector(`[data-card="${k}"]`); if (old) old.remove(); return; }
      let sec = grid.querySelector(`[data-card="${k}"]`);
      if (!sec) {
        sec = document.createElement("section");
        sec.className = `asc-card ascx-card c-${k}`; sec.dataset.card = k;
        sec.innerHTML = `<div class="ascx-ch"><h4>${esc(tr(t))}${f ? " " + tierBadge(FEAT[f][0]) : ` <em class="asc-tier t-p1">${esc(tr("Free"))}</em>`}</h4><small>${esc(tr(sub))}</small></div><div class="ascx-body"></div>`;
        // keep the cards in their list order
        const after = CARDS.slice(0, CARDS.findIndex((x) => x[0] === k)).map((x) => grid.querySelector(`[data-card="${x[0]}"]`)).filter(Boolean).pop();
        if (after) after.insertAdjacentElement("afterend", sec); else grid.prepend(sec);
        if (unfolded.has(k + addr) && !reduce) { sec.classList.add("unfold"); unfolded.delete(k + addr); }
      }
      const body = sec.querySelector(".ascx-body");
      if (body.dataset.state === addr + ":" + cur.res.score + ":" + (cur.lp ? 1 : 0)) return;
      body.dataset.state = addr + ":" + cur.res.score + ":" + (cur.lp ? 1 : 0);
      try { RENDER[k](body, cur); } catch (e) { console.warn("scanner tool", k, e); body.innerHTML = `<p class="asc-hnote">${esc(tr("Couldn't draw this right now."))}</p>`; }
    });
    lockBox.hidden = !locked.length;
    if (locked.length) {
      const who = `${X.w}|${X.ent ? X.ent.p2.left + "|" + X.ent.p3.left + "|" + X.ent.p3.shared : ""}|${locked.map((x) => x[0]).join(",")}`;
      lockBox.querySelector("summary").innerHTML = `<span class="ascx-lk-i" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg></span><b>${esc(tr("More tools"))} <span data-no-i18n>${locked.length}</span></b><span>${[...new Set(locked.map(([, f]) => FEAT[f][0]))].map(tierBadge).join(" ")}</span><small>${esc(tr(signedIn() ? "Open one for 24 hours on this token." : "Sign in with a wallet to open them."))}</small>`;
      if (lockList.__who !== who) {
        lockList.__who = who;
        lockList.innerHTML = locked.map(([k, f, t, sub], i) => `<li style="--i:${i}"><div><b>${esc(tr(t))} ${tierBadge(FEAT[f][0])}</b><small>${esc(tr(sub))}</small></div><button type="button" class="ascx-btn pri" data-unlock="${f}" data-subj="${esc(addr)}" data-card-k="${k}">${esc(tr(signedIn() ? "Unlock for 24 hours" : "Sign in and unlock"))}</button></li>`).join("");
      }
    }
  }

  // ---- Free: dry-run trades, as moving coins ----
  const sizeLbl = { small: "0.01%", mid: "0.1%", large: "1%" };
  let laneI = 0;
  function lane(name, leg, sizeK, extra) {
    const st = !leg ? "skip" : leg.ok === false || leg.ok2 === false ? "fail" : "ok";
    const tax = leg && leg.tax > 0.01 ? K.pct(leg.tax) : null;
    const res = st === "skip" ? tr("not tried") : st === "fail" ? tr("refused") : tax ? `${tr("arrived")} −${tax}` : tr("went through");
    return `<li class="ln-${st}" style="--i:${laneI++}"><span class="nm">${esc(tr(name))}${sizeK ? ` <small data-no-i18n>${sizeLbl[sizeK] || ""}</small>` : ""}</span>
      <span class="track" aria-hidden="true"><i class="coin"></i>${tax ? `<b class="drop" data-no-i18n>−${tax}</b>` : ""}${st === "fail" ? `<b class="lock">${ICON.risk}</b>` : ""}</span>
      <span class="rs">${esc(res)}${extra ? ` <small>${esc(extra)}</small>` : ""}</span></li>`;
  }
  const RENDER = {
    sim(body, cur) {
      const L = (cur.sim && cur.sim.legs) || null;
      if (!cur.sim || !cur.sim.supported || !L) { body.innerHTML = `<p class="asc-hnote">${esc(tr(cur.sim && !cur.sim.supported ? (cur.ch === "rh" ? "The Robinhood Chain RPC didn't accept the dry run this time." : "The Arc RPC didn't accept the dry run this time.") : "There was no holder the dry run could act as."))}</p>`; return; }
      const f = L.fresh, tw = L.twice;
      laneI = 0;
      body.innerHTML = `<ul class="ascx-lanes">
        ${(L.buy || []).map((l) => lane("Buy", l, l.k)).join("")}
        ${(L.sell || []).map((l) => lane("Sell", l, l.k)).join("")}
        ${f ? lane("New buyer sells", f.ok1 ? { ok: f.ok2, tax: f.tax } : null, null, f.ok1 && !f.ok2 && f.reason ? `"${String(f.reason).slice(0, 40)}"` : "") : ""}
        ${tw ? lane("Second sell right after", tw.ok1 ? { ok: tw.ok2 } : null) : ""}
        ${L.send ? lane("Send to a wallet", L.send) : ""}
      </ul><p class="asc-hnote">${esc(tr("Sizes are shares of the supply. A pretend transfer on the latest block — nothing is signed or spent."))}</p>`;
    },
    // v4, Solana: Jupiter's quotes at three sizes
    solq(body, cur) {
      const q = (cur.sol && cur.sol.quotes) || [];
      if (!q.length || q.every((x) => x.ok == null)) { body.innerHTML = `<p class="asc-hnote">${esc(tr("Jupiter didn't answer just now — scan again in a moment."))}</p>`; return; }
      laneI = 0;
      body.innerHTML = `<ul class="ascx-lanes">${q.map((x) => lane("Sell", x.ok == null ? null : { ok: x.ok, tax: 0 }, x.k, x.ok ? `${tr("price")} −${K.pct(x.impact || 0)}` : x.ok === false ? tr("no route") : "")).join("")}</ul>
        ${q.find((x) => x.ok && x.via && x.via.length) ? `<p class="asc-hnote">${esc(tr("Route"))}: <span data-no-i18n>${esc(q.find((x) => x.ok && x.via && x.via.length).via.join(", "))}</span></p>` : ""}
        <p class="asc-hnote">${esc(tr("Sizes are shares of the supply. A price quote from Jupiter — nothing is signed or sent."))}</p>`;
    },
    prebuy(body, cur) {
      const res = cur.res, fees = K.feesOf(res, cur.x, cur.sim);
      if (!res.market || !(res.market.liq > 0) || !(res.market.price > 0)) { body.innerHTML = `<p class="asc-hnote">${esc(tr("There's no priced pool to estimate a buy against."))}</p>`; return; }
      body.innerHTML = `<div class="ascx-pb">
        <div class="ascx-tank" aria-hidden="true"><div class="water"><i></i></div><div class="mine"></div><small data-no-i18n>${K.usd(res.market.liq)}</small></div>
        <div class="ascx-pb-main">
          <label class="ascx-lbl">${esc(tr("If I buy"))} <b data-pb-amt data-no-i18n>$100</b><input type="range" min="0" max="100" value="40" data-pb></label>
          <div class="ascx-pb-out">
            <div><small>${esc(tr("You'd get about"))}</small><b data-pb-tok data-no-i18n>—</b></div>
            <div><small>${esc(tr("Price moves up"))}</small><b data-pb-move data-no-i18n>—</b></div>
            <div><small>${esc(tr("Sell straight back"))}</small><b data-pb-back data-no-i18n>—</b></div>
          </div>
          <p class="asc-hnote">${esc(tr("From the pool's depth (x·y = k) with"))} <span data-no-i18n>${K.pct(fees.pool)}</span> ${esc(tr(fees.poolKnown ? "pool fee" : "pool fee (assumed)"))}${fees.buyTax || fees.sellTax ? `, <span data-no-i18n>${K.pct(fees.buyTax)} / ${K.pct(fees.sellTax)}</span> ${esc(tr("tax"))}` : ""}. ${esc(tr("Concentrated pools can differ."))}</p>
        </div></div>`;
      const inp = body.querySelector("[data-pb]");
      const upd = () => {
        const usdIn = Math.round(Math.pow(10, 1 + (Number(inp.value) / 100) * 3)); // $10 → $10,000
        const r = K.preBuy(usdIn, res, fees);
        body.querySelector("[data-pb-amt]").textContent = "$" + usdIn.toLocaleString("en-US");
        if (!r) return;
        body.querySelector("[data-pb-tok]").textContent = `${K.compact(r.tokens)} $${cur.c.symbol}`;
        const mv = body.querySelector("[data-pb-move]"); mv.textContent = "+" + K.pct(r.move); mv.className = r.move > 10 ? "bad" : r.move > 3 ? "mid" : "";
        const bk = body.querySelector("[data-pb-back]"); bk.textContent = `$${r.back.toLocaleString("en-US", { maximumFractionDigits: 2 })} (−${K.pct(Math.max(0, r.lossPct))})`; bk.className = r.lossPct > 15 ? "bad" : r.lossPct > 5 ? "mid" : "";
        // the tank: the pool's USD side, and how much of it this buy would add
        const share = Math.min(1, usdIn / (res.market.liq / 2));
        body.querySelector(".ascx-tank .mine").style.setProperty("--h", `${Math.max(2, share * 55)}%`);
        body.querySelector(".ascx-tank .water").style.setProperty("--h", `${40 + Math.min(1, share) * 5}%`);
      };
      inp.addEventListener("input", upd); upd();
    },
    stress(body, cur) {
      const st = K.stressOf(cur.res);
      if (!st || !st.items.length) { body.innerHTML = `<p class="asc-hnote">${esc(tr("There's no priced pool to test against."))}</p>`; return; }
      body.innerHTML = `<ul class="ascx-stress">${st.items.map((it, i) => it.k === "lp"
        ? `<li style="--i:${i}"><span>${esc(tr(it.t))}</span><div class="bar lp" style="--w:${Math.min(100, it.pct)}%"><i></i></div><b data-no-i18n>${K.pct(it.pct)} ${esc(tr("of the pool"))}</b><small>${esc(tr("liquidity left"))} <span data-no-i18n>${K.usd(it.liqLeft)}</span></small></li>`
        : `<li style="--i:${i}"><span>${esc(tr(it.t))}</span><div class="bar" style="--w:${Math.min(100, it.drop)}%"><i></i></div><b data-no-i18n>−${K.pct(it.drop)}</b><small><span data-no-i18n>${K.pct(it.pct)}</span> ${esc(tr("of the supply"))} · ${esc(tr("they'd get about"))} <span data-no-i18n>${K.usd(it.usdOut)}</span></small></li>`).join("")}</ul>
        <p class="asc-hnote">${esc(tr("One sell into the pool as it is now (x·y = k). Real sells come in pieces and pools refill — read it as the worst case."))}</p>`;
    },
    diff(body, cur) {
      const nowC = K.compactOf(cur.res, cur.c), key = lc(cur.addr);
      const store = ls.get(CMP) || {};
      const mine = store[key];
      let prev = mine && mine.prev ? mine.prev : mine && mine.cmp && Date.now() - mine.cmp.at > 60e3 ? mine.cmp : null;
      if (!prev && cur.server && cur.server.prev) prev = cur.server.prev;
      // keep the older snapshot as the baseline until it's an hour old
      if (!mine || !mine.cmp || Date.now() - mine.cmp.at > 3600e3) store[key] = { cmp: nowC, prev: mine && mine.cmp ? mine.cmp : null };
      else store[key] = { cmp: nowC, prev: mine.prev || mine.cmp };
      const keys = Object.keys(store); if (keys.length > 40) keys.slice(0, keys.length - 40).forEach((k2) => delete store[k2]);
      ls.set(CMP, store);
      if (!prev) { body.innerHTML = `<p class="asc-hnote">${esc(tr("This is the first scan of it here — scan again later and the changes show up."))}</p>`; return; }
      const d = K.diffOf(prev, nowC);
      const when = K.ageText(Math.max(60, (Date.now() - prev.at) / 1000));
      body.innerHTML = d.length ? `<p class="asc-hnote">${esc(tr("Compared with the scan from"))} <span data-no-i18n>${esc(when)}</span> ${esc(tr("ago"))}.</p><ul class="ascx-diff">${d.map((x, i) => `<li class="d-${x.dir} k-${x.k}" style="--i:${i}"><i aria-hidden="true">${x.dir === "up" ? "▲" : "▼"}</i><span>${x.k === "new" ? `<em>${esc(tr("New"))}</em> ` : x.k === "gone" ? `<em>${esc(tr("Gone"))}</em> ` : ""}${esc(tr(x.t).replace("{x}", ""))}${x.x ? ` <b data-no-i18n>${esc(x.x)}</b>` : ""}</span></li>`).join("")}</ul>`
        : `<p class="asc-hnote">${esc(tr("Nothing changed since the scan from"))} <span data-no-i18n>${esc(when)}</span> ${esc(tr("ago"))}.</p>`;
    },
    async chart(body, cur) {
      body.innerHTML = `<div class="ascx-chart is-loading"><div class="skel"></div></div>`;
      let j = null;
      for (let i = 0; i < 3; i++) {
        j = await fetchJson(`/api/scan?chart=${lc(cur.addr)}&${auth()}`, 25000);
        if (!j || j.error || j.done || (j.points && j.points.length > 20)) break;
      }
      if (A.state !== cur) return;
      if (!j || j.error) { body.innerHTML = `<p class="asc-hnote">${esc(tr((j && j.error) || "Couldn't read the pool's swaps right now."))}</p>`; return; }
      if (!j.points || j.points.length < 2) { body.innerHTML = `<p class="asc-hnote">${esc(tr(j.note || "Not enough swaps yet to draw a chart."))}</p>`; return; }
      drawChart(body, j, cur);
    },
    linked(body, cur) {
      const d = cur.res.dist;
      const cl = (d && d.clusters) || [];
      if (!cl.length) { body.innerHTML = `<p class="asc-hnote">${esc(tr("None of the largest wallets look like one owner spread over many."))}</p>`; return; }
      const why = { moved: "moved tokens between each other", funded: "got tokens from the same sender", block: "bought in the same first block" };
      body.innerHTML = `<ul class="ascx-linked">${cl.map((g, i) => `<li style="--i:${i}"><div class="top"><b data-no-i18n>${K.pct(g.pct)}</b><span>${g.members.length} ${esc(tr("wallets"))}</span>${g.why.map((w) => `<em>${esc(tr(why[w] || w))}</em>`).join("")}</div>
        <div class="mem">${g.members.slice(0, 8).map((a) => `<a href="${ex("address", a)}" target="_blank" rel="noopener" class="asc-addr" data-no-i18n style="--h:${A.hueOf(a)}"><i></i>${short(a)}</a>`).join("")}</div>
        <button type="button" class="asc-link-btn" data-showmap="${i}">${esc(tr("Show on the map"))} →</button></li>`).join("")}</ul>`;
    },
    traders(body, cur) {
      const f = cur.h && cur.h.flow;
      if (!f || !f.n) { body.innerHTML = `<p class="asc-hnote">${esc(tr("No trades with the pool read yet."))}</p>`; return; }
      body.innerHTML = `<div class="ascx-trade-top"><div><b data-no-i18n>${f.n}</b><small>${esc(tr("latest trades"))}</small></div><div><b data-no-i18n>${f.buyers}</b><small>${esc(tr("wallets bought"))}</small></div><div><b data-no-i18n>${f.sellers}</b><small>${esc(tr("wallets sold"))}</small></div></div>
        <div class="ascx-share"><span>${esc(tr("The 3 busiest wallets"))}</span><div class="bar" style="--w:${Math.round(f.top3 * 100)}%"><i></i></div><b data-no-i18n>${K.pct(f.top3 * 100)}</b></div>
        <ol class="ascx-busy">${(f.busiest || []).map(([w, n, b, s2]) => `<li><a href="${ex("address", w)}" target="_blank" rel="noopener" data-no-i18n>${short(w)}</a><span data-no-i18n>${n}</span><em>${b && s2 ? esc(tr("buys and sells")) : b ? esc(tr("buys")) : esc(tr("sells"))}</em></li>`).join("")}</ol>
        <p class="asc-hnote">${esc(tr("From the token's own transfers with the pool."))}</p>`;
    },
    alerts(body, cur) {
      const list = A.watched(), key = lc(cur.addr);
      const w = list.find((x) => lc(x.a) === key);
      const R = (w && w.rules) || { owner: true, supply: true, liq: 30, score: true };
      body.innerHTML = `${w ? "" : `<p class="asc-hnote">${esc(tr("Press Watch on the result first — these rules apply to your watch list."))}</p>`}
        <form class="ascx-rules" data-rules>
          <label><input type="checkbox" name="owner"${R.owner ? " checked" : ""}> ${esc(tr("The owner changes or renounces"))}</label>
          <label><input type="checkbox" name="supply"${R.supply ? " checked" : ""}> ${esc(tr("New tokens are minted"))}</label>
          <label><input type="checkbox" name="liqOn"${R.liq ? " checked" : ""}> ${esc(tr("Liquidity falls by"))} <select name="liq">${[15, 30, 50].map((v) => `<option value="${v}"${Number(R.liq || 30) === v ? " selected" : ""}>${v}%</option>`).join("")}</select></label>
          <label><input type="checkbox" name="score"${R.score ? " checked" : ""}> ${esc(tr("The scanner score drops 10 or more"))}</label>
          <button type="submit" class="ascx-btn pri"${w ? "" : " disabled"}>${esc(tr("Save rules"))}</button>
        </form>`;
      body.querySelector("[data-rules]").addEventListener("submit", (e) => {
        e.preventDefault();
        const fm = e.currentTarget, L2 = A.watched(), it = L2.find((x) => lc(x.a) === key);
        if (!it) return;
        it.rules = { owner: fm.owner.checked, supply: fm.supply.checked, liq: fm.liqOn.checked ? Number(fm.liq.value) : 0, score: fm.score.checked };
        A.saveWatched(L2); toast(tr("Alert rules saved."));
      });
    },
    async note(body, cur) {
      body.innerHTML = `<div class="asc-skel-rows"><i></i></div>`;
      const j = await fetchJson(`/api/scan?note=${lc(cur.addr)}`, 8000);
      if (A.state !== cur) return;
      const n = j && j.note;
      body.innerHTML = `${n ? `<blockquote class="ascx-note"><p>${esc(n.text)}</p>${(n.links || []).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener nofollow" data-no-i18n>${esc(u.replace(/^https:\/\//, "").slice(0, 48))} ↗</a>`).join(" ")}
          <footer>${esc(tr("Signed by the"))} ${esc(tr(n.role))} <a href="${ex("address", n.by)}" target="_blank" rel="noopener" data-no-i18n>${short(n.by)}</a> · <span data-no-i18n>${new Date(n.at * 1000).toISOString().slice(0, 10)}</span></footer></blockquote>
          <p class="asc-hnote">${esc(tr("The project's own words — not checked by ARCIRCLE."))}</p>` : `<p class="asc-hnote">${esc(tr("The project hasn't posted a note."))}</p>`}
        <button type="button" class="ascx-btn" data-xact="note">${esc(tr(n ? "Update the note" : "I run this token — post a note"))} ${tierBadge("p2")}</button>`;
    },
    async take(body, cur) {
      body.innerHTML = `<div class="asc-skel-rows"><i></i><i></i></div>`;
      const j = await fetchJson(`/api/scan?take=${lc(cur.addr)}&${auth()}`, 25000);
      if (A.state !== cur) return;
      if (!j || j.error) { body.innerHTML = `<p class="asc-hnote">${esc(tr((j && j.error) || "ARCIA couldn't answer right now."))}</p>`; return; }
      body.innerHTML = `<div class="ascx-take"><img src="images/arcia-avatar.jpg" alt="" width="40" height="40" loading="lazy"><p data-no-i18n>${esc(j.text)}</p></div>
        <p class="asc-hnote">${esc(tr(j.ai ? "Written by ARCIA from this scan. Not financial advice." : "ARCIA's model isn't answering right now, so this is the scanner's own summary."))}</p>
        <button type="button" class="ascx-btn" data-act="arcia">${esc(tr("Ask ARCIA more"))}</button>`;
    },
  };

  // ---- the chart: price per hour (line) over volume (bars, a second panel — not a second axis) ----
  function drawChart(body, j, cur) {
    const pts = j.points, W = 640, H1 = 170, H2 = 50, GAP = 12, H = H1 + GAP + H2 + 20, PADL = 6, PADR = 58;
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t + 3600, xs = (t) => PADL + ((t - t0) / Math.max(1, t1 - t0)) * (W - PADL - PADR);
    const lo = Math.min(...pts.map((p) => p.l)), hi = Math.max(...pts.map((p) => p.h)), pad = (hi - lo) * 0.08 || hi * 0.05;
    const ys = (v) => 8 + (1 - (v - (lo - pad)) / Math.max(1e-18, hi + pad - (lo - pad))) * (H1 - 16);
    const vmax = Math.max(...pts.map((p) => p.vol)) || 1;
    const line = pts.map((p) => `${xs(p.t + 1800).toFixed(1)},${ys(p.c).toFixed(1)}`).join(" ");
    const area = `M${xs(pts[0].t + 1800).toFixed(1)},${H1} L${line.replace(/ /g, " L")} L${xs(pts[pts.length - 1].t + 1800).toFixed(1)},${H1} Z`;
    const bw = Math.max(1.5, ((W - PADL - PADR) / Math.max(1, (t1 - t0) / 3600)) - 2);
    const bars = pts.map((p) => { const h = Math.max(1, (p.vol / vmax) * H2); return `<rect x="${(xs(p.t) + 1).toFixed(1)}" y="${(H1 + GAP + H2 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5" class="${p.buys * 2 >= p.n ? "b" : "s"}"/>`; }).join("");
    const MK = { mint: "Mint", owner: "Owner change", pause: "Paused", unpause: "Unpaused", upgrade: "Code upgrade", big: "Large transfer", burn: "Burn", "lp-add": "Liquidity added", "lp-remove": "Liquidity removed" };
    const marks = (j.marks || []).filter((m) => m.ts >= t0 && m.ts <= t1);
    const mk = marks.map((m, i) => `<g class="mk mk-${m.k}" data-mi="${i}"><line x1="${xs(m.ts).toFixed(1)}" x2="${xs(m.ts).toFixed(1)}" y1="4" y2="${H1}"/><circle cx="${xs(m.ts).toFixed(1)}" cy="6" r="4.5"/></g>`).join("");
    const ticks = [lo, (lo + hi) / 2, hi].map((v) => `<text x="${W - PADR + 6}" y="${(ys(v) + 4).toFixed(1)}">${esc(K.usd(v))}</text><line class="grid" x1="${PADL}" x2="${W - PADR}" y1="${ys(v).toFixed(1)}" y2="${ys(v).toFixed(1)}"/>`).join("");
    const days = []; for (let t = Math.ceil(t0 / 86400) * 86400; t < t1; t += 86400) days.push(t);
    const dt = days.map((t) => `<text class="dt" x="${xs(t).toFixed(1)}" y="${H - 4}" text-anchor="middle">${new Date(t * 1000).toISOString().slice(5, 10)}</text>`).join("");
    const kinds = [...new Set(marks.map((m) => m.k))];
    const first = pts[0].c, last = pts[pts.length - 1].c, chg = ((last - first) / first) * 100;
    body.innerHTML = `<div class="ascx-chart"><div class="ascx-chart-top"><b data-no-i18n>${esc(K.usd(last))}</b><em class="${chg >= 0 ? "up" : "down"}" data-no-i18n>${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%</em><small data-no-i18n>${esc(j.pool.quote)} · ${pts.length}h${j.done ? "" : " · " + esc(tr("older history loading"))}</small></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tr("Price per hour and volume"))}"><defs><linearGradient id="ascxArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
        ${ticks}<path class="area" d="${area}"/><polyline class="price" points="${line}"/>${mk}<g class="vol">${bars}</g>${dt}
        <g class="xh" hidden><line class="v" y1="0" y2="${H1 + GAP + H2}"/><circle r="4"/></g><rect class="hit" x="0" y="0" width="${W}" height="${H}" fill="transparent"/></svg>
      <div class="ascx-tip" hidden></div>
      ${kinds.length ? `<ul class="ascx-legend">${kinds.map((k) => `<li class="mk-${k}"><i></i>${esc(tr(MK[k] || k))}</li>`).join("")}</ul>` : ""}
      <p class="asc-hnote">${esc(tr("From the pool's Swap events on Arc; bars are volume per hour (green when most trades were buys)."))}</p></div>`;
    const svg = body.querySelector("svg"), tip = body.querySelector(".ascx-tip"), xh = svg.querySelector(".xh");
    const move = (e) => {
      const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W;
      const t = t0 + ((x - PADL) / (W - PADL - PADR)) * (t1 - t0);
      let best = pts[0]; for (const p of pts) if (Math.abs(p.t + 1800 - t) < Math.abs(best.t + 1800 - t)) best = p;
      const mm = marks.filter((m) => Math.abs(m.ts - t) < 2400);
      xh.hidden = false; xh.querySelector("line").setAttribute("x1", xs(best.t + 1800)); xh.querySelector("line").setAttribute("x2", xs(best.t + 1800));
      xh.querySelector("circle").setAttribute("cx", xs(best.t + 1800)); xh.querySelector("circle").setAttribute("cy", ys(best.c));
      tip.hidden = false;
      tip.innerHTML = `<b data-no-i18n>${new Date(best.t * 1000).toISOString().slice(5, 16).replace("T", " ")} UTC</b><span data-no-i18n>${esc(K.usd(best.c))}</span><small>${esc(tr("Volume"))} <span data-no-i18n>${esc(K.usd(best.vol))} · ${best.n}</span> ${esc(tr("trades"))}</small>${mm.map((m) => `<em class="mk-${m.k}">${esc(tr(MK[m.k] || m.k))}</em>`).join("")}`;
      const px = ((xs(best.t + 1800) / W) * r.width);
      tip.style.left = `${Math.min(r.width - 170, Math.max(0, px + 12))}px`;
    };
    svg.addEventListener("pointermove", move); svg.addEventListener("pointerleave", () => { xh.hidden = true; tip.hidden = true; });
    if (!reduce) svg.classList.add("draw");
  }

  // =====================================================================
  // intro: plans, New on Arc, approvals, batch, webhooks
  // =====================================================================
  function paintIntro() {
    const intro = $("asc-intro");
    if (!intro) return;
    let host = $("ascx-intro");
    if (!host) { host = document.createElement("div"); host.id = "ascx-intro"; host.className = "ascx-intro"; const what = intro.querySelector(".asc-dev"); if (what) what.insertAdjacentElement("afterend", host); else intro.appendChild(host); }
    let plans = $("ascx-plans");
    if (!plans) { plans = document.createElement("div"); plans.id = "ascx-plans"; plans.className = "ascx-plans"; intro.appendChild(plans); }
    plans.innerHTML = plansHtml();
    const block = (id, f, title, sub, inner) => `<section class="asc-card ascx-icard" id="${id}"><div class="ascx-ch"><h2>${esc(tr(title))} ${tierBadge(FEAT[f][0])}</h2><small>${esc(tr(sub))}</small></div><div class="ascx-body">${has(f, "all") || f === "approvals" ? inner : lockHtml(f, "all")}</div></section>`;
    host.innerHTML = block("ascx-feed", "feed", "New on Arc", "New pools on Arc with their scanner scores, newest first.", `<div class="ascx-feed-list"><div class="asc-skel-rows"><i></i><i></i><i></i></div></div>`)
      + block("ascx-appr", "approvals", "Wallet approvals", "Which contracts can move tokens out of a wallet — and revoke them.", `<form class="ascx-appr-form"><input type="text" placeholder="${esc(tr("Wallet address (0x…)"))}" value="${esc(state.account || "")}" data-appr-w spellcheck="false"><button type="submit" class="ascx-btn pri">${esc(tr("Check approvals"))}</button></form><div class="ascx-appr-out"></div>`)
      + block("ascx-batch", "batch", "Batch scan", "Up to 25 tokens at once, as a table you can download.", `<form class="ascx-batch-form"><textarea rows="3" placeholder="0x…&#10;0x…" data-batch spellcheck="false"></textarea><button type="submit" class="ascx-btn pri">${esc(tr("Scan them"))}</button></form><div class="ascx-batch-out"></div>`)
      + block("ascx-hooks", "webhook", "Webhooks", "Get a signed POST when a token's owner, supply, liquidity or score changes.", `<div class="ascx-hooks-out"><div class="asc-skel-rows"><i></i></div></div>`);
    if (has("feed", "all")) loadFeed();
    if (has("webhook", "all")) loadHooks();
  }
  async function loadFeed() {
    const box = document.querySelector("#ascx-feed .ascx-feed-list");
    if (!box) return;
    const j = await fetchJson(`/api/scan?feed=1&${auth()}`, 25000);
    if (!j || j.error) { box.innerHTML = `<p class="asc-hnote">${esc(tr((j && j.error) || "Couldn't read new pools right now."))}</p>`; return; }
    box.innerHTML = j.items && j.items.length ? `<ul class="ascx-feed">${j.items.slice(0, 20).map((x, i) => `<li style="--i:${i}"><button type="button" data-t="${esc(x.token)}"><b data-no-i18n>${x.sym ? "$" + esc(x.sym) : short(x.token)}</b><small><span data-no-i18n>${K.ageText(now() - x.ts)}</span> ${esc(tr("ago"))} · ${esc(tr(x.venue))}</small>
      ${x.crit && x.crit.length ? `<em class="crit">${esc(tr(x.crit[0]))}</em>` : ""}${x.score != null ? `<span class="asc-mini v-${K.verdictOf(x.score).k}"><b data-no-i18n>${x.score}</b></span>` : `<i class="asc-dep-wait" title="${esc(tr("Scanning soon"))}"></i>`}</button></li>`).join("")}</ul>` : `<p class="asc-hnote">${esc(tr("No new pools in the last day and a half."))}</p>`;
  }
  async function loadHooks() {
    const box = document.querySelector("#ascx-hooks .ascx-hooks-out");
    if (!box) return;
    const j = signedIn() ? await fetchJson(`/api/scan?hooks=1&${auth()}`, 9000) : null;
    const list = (j && j.hooks) || [];
    box.innerHTML = `${list.length ? `<ul class="ascx-hooklist">${list.map((h) => `<li><b data-no-i18n>${short(h.token)}</b><code data-no-i18n>${esc(h.url)}</code><small data-no-i18n>${esc((h.ev || []).join(", "))}</small><button type="button" class="ascx-btn ghost" data-hookdel="${esc(h.id)}">${esc(tr("Remove"))}</button></li>`).join("")}</ul>` : `<p class="asc-hnote">${esc(tr("No webhooks yet."))}</p>`}
      <form class="ascx-hook-form"><input type="text" placeholder="${esc(tr("Token address (0x…)"))}" data-hook-t value="${esc(A.state && A.state.addr ? A.state.addr : "")}" spellcheck="false"><input type="url" placeholder="https://your-server.example/hook" data-hook-u>
        <div class="ascx-evs">${["owner", "supply", "liquidity", "lp", "score", "sell"].map((e) => `<label><input type="checkbox" value="${e}" checked> ${esc(tr({ owner: "Owner", supply: "Supply", liquidity: "Liquidity", lp: "LP locks", score: "Score", sell: "Large sells" }[e]))}</label>`).join("")}</div>
        <button type="submit" class="ascx-btn pri">${esc(tr("Add webhook"))} ${tierBadge("p3")}</button></form>
      <p class="asc-hnote">${esc(tr("Each call carries x-arcircle-signature: an HMAC-SHA256 of the body with the secret you get once when you add it. Checked every 15 minutes."))}</p>`;
  }
  async function runApprovals(w, out) {
    w = lc(w);
    if (!isAddr(w)) { out.innerHTML = `<p class="asc-hnote">${esc(tr("That isn't a wallet address."))}</p>`; return; }
    if (!(await unlock("approvals", w))) return;
    out.innerHTML = `<div class="asc-skel-rows"><i></i><i></i></div>`;
    let j = null;
    for (let i = 0; i < 12; i++) {
      j = await fetchJson(`/api/scan?appr=${w}&${auth()}`, 25000);
      if (!j || j.error) break;
      paintAppr(out, j, w);
      if (j.done) break;
    }
    if (!j || j.error) out.innerHTML = `<p class="asc-hnote">${esc(tr((j && j.error) || "Couldn't read approvals right now."))}</p>`;
  }
  function paintAppr(out, j, w) {
    const mine = state.account && lc(state.account) === lc(w);
    const RISK = { wallet: ["risk", "A wallet (not a contract)"], contract: ["warn", "Unknown contract"], known: ["pass", "Known"] };
    out.innerHTML = `${j.done ? "" : `<p class="ascx-prog"><i style="--w:${Math.round((j.progress || 0) * 100)}%"></i><span>${esc(tr("Reading the wallet's history…"))} <b data-no-i18n>${Math.round((j.progress || 0) * 100)}%</b></span></p>`}
      ${j.approvals.length ? `<table class="ascx-appr"><thead><tr><th>${esc(tr("Token"))}</th><th>${esc(tr("Can spend"))}</th><th>${esc(tr("Spender"))}</th><th></th></tr></thead><tbody>${j.approvals.map((a) => { const r = RISK[a.risk] || RISK.contract; return `<tr class="st-${r[0]}"><td data-no-i18n>${a.symbol ? "$" + esc(a.symbol) : short(a.token)}${a.kind === "p" ? ` <small>Permit2</small>` : ""}</td>
        <td data-no-i18n>${a.unlimited ? `<b class="unl">${esc(tr("Unlimited"))}</b>` : esc(K.compact(a.human))}</td>
        <td><a href="${ex("address", a.spender)}" target="_blank" rel="noopener" data-no-i18n>${esc(a.spenderName || short(a.spender))}</a><small>${esc(tr(r[1]))}</small></td>
        <td>${mine ? `<button type="button" class="ascx-btn ghost" data-revoke="${esc(a.token)}|${esc(a.spender)}|${a.kind}">${esc(tr("Revoke"))}</button>` : ""}</td></tr>`; }).join("")}</tbody></table>` : `<p class="asc-hnote">${esc(tr(j.done ? "No open approvals found." : "None found so far."))}</p>`}
      ${mine ? "" : `<p class="asc-hnote">${esc(tr("Connect this wallet to revoke."))}</p>`}`;
  }
  async function revoke(spec, btn) {
    const [token, spender, kind] = spec.split("|");
    try {
      if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
      btn.disabled = true; btn.textContent = tr("Confirm in your wallet…");
      const tx = kind === "p"
        ? await new ethers.Contract(K.ADDR.permit2, ["function approve(address token,address spender,uint160 amount,uint48 expiration)"], state.signer).approve(token, spender, 0, 0)
        : await new ethers.Contract(token, ["function approve(address,uint256) returns (bool)"], state.signer).approve(spender, 0);
      btn.textContent = tr("Revoking…"); await tx.wait();
      btn.closest("tr").classList.add("gone"); btn.textContent = tr("Revoked"); toast(tr("Approval revoked."));
    } catch (e) { btn.disabled = false; btn.textContent = tr("Revoke"); toast(e && (e.code === "ACTION_REJECTED" || e.code === 4001) ? tr("You cancelled in your wallet.") : String((e && (e.shortMessage || e.message)) || e).slice(0, 140)); }
  }
  async function runBatch(text, out) {
    const list = [...new Set((String(text).match(/0x[0-9a-fA-F]{40}/g) || []).map(lc))].slice(0, 25);
    if (!list.length) { out.innerHTML = `<p class="asc-hnote">${esc(tr("Paste token addresses, one per line."))}</p>`; return; }
    out.innerHTML = `<div class="asc-skel-rows"><i></i><i></i></div>`;
    let j = null;
    for (let i = 0; i < 8; i++) {
      j = await post({ action: "batch", w: X.w, s: X.s, tokens: list });
      if (!j || j.error) break;
      paintBatch(out, j);
      if (!j.pending) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!j || j.error) out.innerHTML = `<p class="asc-hnote">${esc(tr((j && j.error) || "Couldn't scan those right now."))}</p>`;
  }
  function paintBatch(out, j) {
    const rows = j.results;
    out.innerHTML = `${j.pending ? `<p class="ascx-prog"><i style="--w:${Math.round(((rows.length - j.pending) / rows.length) * 100)}%"></i><span>${esc(tr("Scanning"))} <b data-no-i18n>${rows.length - j.pending}/${rows.length}</b></span></p>` : ""}
      <table class="ascx-batch"><thead><tr><th>${esc(tr("Token"))}</th><th>${esc(tr("Score"))}</th><th>${esc(tr("Verdict"))}</th><th>${esc(tr("Critical"))}</th></tr></thead><tbody>${rows.map((r) => `<tr><td><button type="button" class="asc-link-btn" data-t="${esc(r.token)}" data-no-i18n>${r.sym ? "$" + esc(r.sym) : short(r.token)}</button></td>
        <td data-no-i18n>${r.pending ? "…" : r.notToken ? "—" : r.score}</td><td>${r.pending ? `<i class="asc-dep-wait"></i>` : r.notToken ? esc(tr("Not a token")) : `<span class="v-${r.k}">${esc(tr(r.verdict))}</span>`}</td><td>${(r.critical || []).map((c) => esc(tr(c))).join(", ")}</td></tr>`).join("")}</tbody></table>
      ${j.pending ? "" : `<button type="button" class="ascx-btn" data-csv>${esc(tr("Download CSV"))}</button>`}`;
    out.__rows = rows;
  }
  function csv(rows) {
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const lines = [["token", "symbol", "score", "verdict", "confidence", "critical", "summary"].join(",")].concat(rows.map((r) => [r.token, r.sym || "", r.score ?? "", r.verdict || "", r.confidence || "", (r.critical || []).join("; "), r.summary || ""].map(q).join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" })); a.download = `arcircle-scan-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // =====================================================================
  // search by name (Pro), in the address box
  // =====================================================================
  let sq = null, st = 0;
  function searchBox() {
    const inp = $("asc-addr");
    if (!inp || inp.__ascx) return;
    inp.__ascx = true;
    const dd = document.createElement("div"); dd.className = "ascx-dd"; dd.hidden = true; dd.id = "ascx-dd";
    inp.closest(".asc-search").appendChild(dd);
    inp.addEventListener("input", () => {
      const v = inp.value.trim();
      clearTimeout(st);
      // addresses (0x… or a Solana mint) and the Solana side don't search by name
      if (!v || /^0x/i.test(v) || v.length < 2 || (A.isMintS && A.isMintS(v)) || (A.SOLC && A.SOLC())) { dd.hidden = true; return; }
      st = setTimeout(() => runSearch(v, dd), 280);
    });
    inp.addEventListener("keydown", (e) => { if (e.key === "Escape") dd.hidden = true; });
    document.addEventListener("click", (e) => { if (!e.target.closest(".asc-search")) dd.hidden = true; });
  }
  async function runSearch(q, dd) {
    dd.hidden = false;
    if (!has("search", "all")) { dd.innerHTML = `<div class="ascx-dd-lock">${esc(tr("Search tokens by name or ticker"))} ${tierBadge("p3")}<button type="button" class="ascx-btn pri" data-unlock="search" data-subj="all">${esc(tr("Unlock"))}</button></div>`; return; }
    sq = q;
    dd.innerHTML = `<div class="asc-skel-rows"><i></i></div>`;
    const j = await fetchJson(`/api/scan?search=${encodeURIComponent(q)}&${auth()}`, 12000);
    if (sq !== q) return;
    if (!j || j.error || !j.results) { dd.innerHTML = `<p class="asc-hnote">${esc(tr((j && j.error) || "Search isn't answering right now."))}</p>`; return; }
    dd.innerHTML = j.results.length ? `<ul>${j.results.map((r) => `<li><button type="button" data-t="${esc(r.token)}"><b data-no-i18n>$${esc(r.sym || "?")}</b><span data-no-i18n>${esc(r.name || "")}</span><small data-no-i18n>${short(r.token)}${r.liq ? " · " + K.usd(r.liq) : ""}</small>${r.same > 1 ? `<em class="dup">${r.same} ${esc(tr("with this ticker"))}</em>` : ""}${r.score != null ? `<span class="asc-mini v-${r.k}"><b data-no-i18n>${r.score}</b></span>` : ""}</button></li>`).join("")}</ul>
      ${j.results.some((r) => r.same > 1) ? `<p class="ascx-dd-warn">${esc(tr("Several tokens share this ticker — pick by the address, not the name."))}</p>` : ""}` : `<p class="asc-hnote">${esc(tr("No Arc tokens match."))}</p>`;
  }

  // =====================================================================
  // wiring
  // =====================================================================
  async function postNote() {
    const cur = A.state;
    if (!cur || !(await unlock("note", cur.addr))) return;
    const m = modal(`<h3>${esc(tr("A note from the project"))}</h3><p>${esc(tr("Only the token's owner, the wallet that deployed it or its launchpad creator can sign one. It shows on every scan of this token, marked as the project's own words."))}</p>
      <textarea rows="4" maxlength="500" data-note-t placeholder="${esc(tr("e.g. The liquidity lock was extended to 2027 — see the link."))}"></textarea>
      <input type="url" data-note-l placeholder="https://… (${esc(tr("optional link"))})">
      <p class="ascx-err" hidden></p><div class="ascx-row"><button type="button" class="ascx-btn" data-mclose>${esc(tr("Cancel"))}</button><button type="button" class="ascx-btn pri" data-note-go>${esc(tr("Sign and post"))}</button></div>`);
    const err = m.el.querySelector(".ascx-err");
    m.el.querySelector("[data-note-go]").addEventListener("click", async (e) => {
      const btn = e.currentTarget, text = m.el.querySelector("[data-note-t]").value.trim(), link = m.el.querySelector("[data-note-l]").value.trim();
      btn.disabled = true; err.hidden = true;
      try {
        const mm = await post({ action: "notemsg", w: X.w, s: X.s, token: cur.addr, text });
        if (!mm.msg) throw new Error(mm.error || "Couldn't prepare the message.");
        const sig = await state.signer.signMessage(mm.msg);
        const j = await post({ action: "note", w: X.w, s: X.s, token: cur.addr, t: mm.t, sig, text, links: link ? [link] : [] });
        if (!j.ok) throw new Error(j.error || "That didn't work.");
        m.close(); toast(tr("Posted.")); const body = document.querySelector('[data-card="note"] .ascx-body'); if (body) { body.dataset.state = ""; paintTools(); }
      } catch (x) { btn.disabled = false; err.hidden = false; err.textContent = x && (x.code === "ACTION_REJECTED" || x.code === 4001) ? tr("You cancelled in your wallet.") : tr(String((x && x.message) || x).slice(0, 160)); }
    });
  }
  async function freezeReport(btn) {
    const cur = A.state;
    if (!cur || !(await unlock("report", cur.addr))) return;
    btn.disabled = true;
    const j = await post({ action: "report", w: X.w, s: X.s, token: cur.addr });
    btn.disabled = false;
    if (!j.ok) { toast(tr(j.error || "Couldn't freeze a report right now.")); return; }
    window.open(`/scan-report/${j.id}`, "_blank", "noopener");
    try { await navigator.clipboard.writeText(j.url); toast(tr("Report saved — link copied.")); } catch { toast(tr("Report saved.")); }
  }
  document.addEventListener("arcscan:result", () => { paintTools(); });
  document.addEventListener("arcscan:act", (e) => {
    const { act, el } = e.detail || {};
    if (act === "report") freezeReport(el);
  });
  panel.addEventListener("click", async (e) => {
    const u = e.target.closest("[data-unlock]");
    if (u) { e.preventDefault(); u.disabled = true; const ok = await unlock(u.dataset.unlock, u.dataset.subj); u.disabled = false; if (ok && u.dataset.cardK) unfolded.add(u.dataset.cardK + lc(u.dataset.subj)); if (ok) { paintTools(); paintIntro(); const dd = $("ascx-dd"); if (dd && !dd.hidden) runSearch($("asc-addr").value.trim(), dd); } return; }
    const xa = e.target.closest("[data-xact]");
    if (xa) { const a = xa.dataset.xact; if (a === "login") { if (await login()) { paintTools(); paintIntro(); } } else if (a === "logout") logout(); else if (a === "note") postNote(); return; }
    const rv = e.target.closest("[data-revoke]");
    if (rv) { revoke(rv.dataset.revoke, rv); return; }
    const cv = e.target.closest("[data-csv]");
    if (cv) { const out = cv.closest(".ascx-batch-out"); if (out && out.__rows) csv(out.__rows); return; }
    const hd = e.target.closest("[data-hookdel]");
    if (hd) { await post({ action: "hook", op: "del", w: X.w, s: X.s, id: hd.dataset.hookdel }); loadHooks(); return; }
    const sm = e.target.closest("[data-showmap]");
    if (sm) {
      const box = $("asc-holders"); if (!box || !A.state || !A.state.res) return;
      box.dataset.view = "map"; box.__html = ""; box.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      // redraw the holders card in map view, then light up that group
      document.dispatchEvent(new CustomEvent("arcscan:redraw-holders"));
      setTimeout(() => { panel.querySelectorAll(`.asc-bmap .b.cl-${sm.dataset.showmap}`).forEach((g) => g.classList.add("sel")); }, 60);
    }
  });
  panel.addEventListener("submit", async (e) => {
    const f = e.target;
    if (f.matches(".ascx-appr-form")) { e.preventDefault(); runApprovals(f.querySelector("[data-appr-w]").value.trim(), f.parentElement.querySelector(".ascx-appr-out")); }
    else if (f.matches(".ascx-batch-form")) { e.preventDefault(); runBatch(f.querySelector("[data-batch]").value, f.parentElement.querySelector(".ascx-batch-out")); }
    else if (f.matches(".ascx-hook-form")) {
      e.preventDefault();
      const token = f.querySelector("[data-hook-t]").value.trim(), url = f.querySelector("[data-hook-u]").value.trim();
      if (!isAddr(token)) { toast(tr("That isn't a token address.")); return; }
      if (!(await unlock("webhook", token))) return;
      const events = [...f.querySelectorAll(".ascx-evs input:checked")].map((x) => x.value);
      const j = await post({ action: "hook", op: "add", w: X.w, s: X.s, token, url, events });
      if (!j.ok) { toast(tr(j.error || "Couldn't add it.")); return; }
      modal(`<h3>${esc(tr("Webhook added"))}</h3><p>${esc(tr("Your signing secret — it's shown only this once:"))}</p><code class="ascx-secret" data-no-i18n>${esc(j.secret)}</code><div class="ascx-row"><button type="button" class="ascx-btn" data-copy="${esc(j.secret)}">${esc(tr("Copy"))}</button><button type="button" class="ascx-btn pri" data-mclose>${esc(tr("Done"))}</button></div>`);
      loadHooks();
    }
  });
  // wallet mode (a wallet pasted in the box): offer its approvals right under the list
  const mo = new MutationObserver(() => {
    const wbox = document.querySelector("#asc-out .asc-wallet");
    if (!wbox || wbox.querySelector(".ascx-appr-in")) return;
    const w = (A.state && A.state.addr) || null;
    const div = document.createElement("div"); div.className = "ascx-appr-in";
    div.innerHTML = `<h3>${esc(tr("This wallet's approvals"))} ${tierBadge("p2")}</h3><div class="ascx-appr-out"></div><button type="button" class="ascx-btn pri" data-apprw="${esc(w || "")}">${esc(tr("Check which contracts can spend from it"))}</button>`;
    wbox.appendChild(div);
  });
  mo.observe($("asc-out"), { childList: true, subtree: false });
  panel.addEventListener("click", (e) => { const b = e.target.closest("[data-apprw]"); if (b) { const w = b.dataset.apprw || ($("asc-addr").value || "").trim(); runApprovals(w, b.parentElement.querySelector(".ascx-appr-out")); } });
  // the live embed card (Pro) — arc-scanner.js asks before showing its code
  window.arcScanX = { wallet: () => (signedIn() ? X.w : null), has, unlock, login, refresh: refreshEnt };
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "scanner") { paintAcct(); paintIntro(); searchBox(); if (signedIn()) refreshEnt().then(() => { paintTools(); paintIntro(); }); } });
  paintAcct(); paintIntro(); searchBox();
  if (signedIn()) refreshEnt().then(() => { paintTools(); paintIntro(); });
})();
