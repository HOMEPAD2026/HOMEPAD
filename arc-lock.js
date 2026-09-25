/* global APC, ARC, CONFIG, state, ethers, ERC20_ABI, readProvider, connectWallet, ensureArcForWrite, apcErrText, apcRenderHeader, refreshAccountDependentViews */
// arc-lock.js — creator self-locks on ArcPad coin pages (contracts/ArcLock.sol).
// A creator can lock part of their own coin until a date they pick; nobody,
// not even the creator, can move it earlier. Coins whose creator has an
// active lock show a "Locked" badge. Hidden until CONFIG.ARCLOCK_ADDRESS is set.
(function () {
  "use strict";
  if (typeof APC === "undefined" || typeof CONFIG === "undefined" || !CONFIG.ARCLOCK_ADDRESS) return;
  const LOCK = CONFIG.ARCLOCK_ADDRESS;
  const ABI = [
    "function lock(address token, uint256 amount, uint64 unlockAt) returns (uint256)",
    "function withdraw(uint256 id)",
    "function extend(uint256 id, uint64 newUnlockAt)",
    "function lockIdsOfOwner(address owner) view returns (uint256[])",
    "function getLock(uint256 id) view returns (tuple(address token, address owner, uint128 amount, uint64 lockedAt, uint64 unlockAt, bool withdrawn))",
    "function locksOfToken(address token) view returns (uint256[] ids, tuple(address token, address owner, uint128 amount, uint64 lockedAt, uint64 unlockAt, bool withdrawn)[] out)",
  ];
  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const SUPPLY = 10n ** 27n; // 1B × 1e18
  const DAY = 86400;
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>';
  const fmtTok = (raw) => { const n = Number(ethers.formatUnits(raw, 18)); return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }); };
  const pct = (raw) => { const p = Number((raw * 10000n) / SUPPLY) / 100; return p >= 10 ? p.toFixed(0) : p.toFixed(p >= 1 ? 1 : 2); };
  const daysLeft = (ts) => Math.max(0, Math.ceil((ts - Date.now() / 1000) / DAY));
  // "D-3" once an unlock is a week away or closer, "12d" before that.
  const soon = (ts) => ts > Date.now() / 1000 && ts - Date.now() / 1000 <= 7 * DAY;
  const left = (ts) => (soon(ts) ? `D-${daysLeft(ts)}` : `${daysLeft(ts)}d`);
  const date = (ts) => new Date(ts * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  const cache = new Map(); // token → { at, locks: [{id, owner, amount, unlockAt, withdrawn}] }
  async function locksOf(token, fresh) {
    const k = lc(token), c = cache.get(k);
    if (c && !fresh && Date.now() - c.at < 30e3) return c.locks;
    const r = await new ethers.Contract(LOCK, ABI, readProvider()).locksOfToken(token);
    const locks = r[0].map((id, i) => ({ id: Number(id), owner: r[1][i].owner, amount: r[1][i].amount, lockedAt: Number(r[1][i].lockedAt), unlockAt: Number(r[1][i].unlockAt), withdrawn: r[1][i].withdrawn }));
    cache.set(k, { at: Date.now(), locks });
    return locks;
  }
  const activeByCreator = (locks, creator) => {
    const now = Date.now() / 1000;
    const act = locks.filter((l) => lc(l.owner) === lc(creator) && !l.withdrawn && l.unlockAt > now);
    return { total: act.reduce((s, l) => s + l.amount, 0n), first: act.length ? Math.min(...act.map((l) => l.unlockAt)) : 0 };
  };

  // ---------------- badge + creator button ----------------
  let seq = 0, sealNext = false;
  async function decorate() {
    const l = APC.l, panel = $("bp-panel-coin");
    if (!l || !panel) return;
    const my = ++seq, token = l.token;
    let locks = [];
    try { locks = await locksOf(token); } catch (e) { return; }
    if (my !== seq || !APC.l || lc(APC.l.token) !== lc(token)) return;
    const { total, first } = activeByCreator(locks, l.creator);
    const row = panel.querySelector(".ac2-name-row");
    let b = $("apc-lockbadge");
    if (total > 0n && row) {
      if (!b) { b = document.createElement("span"); b.id = "apc-lockbadge"; b.className = "lk-badge"; row.appendChild(b); }
      b.innerHTML = `${ICON}<span>Locked</span><b data-no-i18n>${pct(total)}%</b><span class="lk-dot">·</span><b data-no-i18n class="lk-left">${left(first)}</b>`;
      b.classList.toggle("lk-soon", soon(first));
      if (sealNext) { sealNext = false; b.classList.remove("lk-seal"); void b.offsetWidth; b.classList.add("lk-seal"); setTimeout(() => b && b.classList.remove("lk-seal"), 1600); }
      b.title = `${tr("Creator locked")} ${fmtTok(total)} $${l.symbol || ""} (${pct(total)}%) — ${tr("first unlock")} ${date(first)}`;
    } else if (b) b.remove();
    const ca = panel.querySelector(".ac2-ca-row");
    let btn = $("apc-lockbtn");
    const mine = state.account && lc(state.account) === lc(l.creator);
    if (mine && ca) {
      if (!btn) {
        btn = document.createElement("button"); btn.type = "button"; btn.id = "apc-lockbtn"; btn.className = "ac2-chip-btn lk-btn";
        btn.innerHTML = `${ICON}<span>Lock tokens</span>`;
        btn.addEventListener("click", openModal);
        ca.appendChild(btn);
      }
      btn.hidden = false;
    } else if (btn) btn.hidden = true;
  }

  // ---------------- modal ----------------
  let modal = null, busy = false;
  const DURS = [7, 30, 90, 180, 365];
  async function openModal() {
    if (!APC.l) return;
    if (!state.account) { if (typeof connectWallet === "function") connectWallet(); return; }
    close();
    const l = APC.l;
    modal = document.createElement("div");
    modal.className = "cm-modal lk-modal";
    modal.innerHTML = `<div class="cm-backdrop" data-close></div>
      <div class="cm-dialog" role="dialog" aria-modal="true" aria-labelledby="lk-title">
        <div class="cm-dhead"><div><h2 id="lk-title">Lock <span data-no-i18n>$${esc(l.symbol || "")}</span></h2>
          <p>Locked tokens can't be moved by anyone — including you — until the date you pick. Buyers see a Locked badge on the coin.</p></div>
          <button type="button" class="cm-x" data-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
        <div class="cm-pane">
          <label class="cm-field"><span>Amount <em id="lk-bal"></em></span><input id="lk-amt" type="text" inputmode="decimal" autocomplete="off" placeholder="0"></label>
          <div class="lk-chips" id="lk-pcts">${[25, 50, 75, 100].map((p) => `<button type="button" data-p="${p}">${p}%</button>`).join("")}</div>
          <div class="cm-field"><span>Lock for</span></div>
          <div class="lk-chips" id="lk-durs">${DURS.map((d) => `<button type="button" data-d="${d}"${d === 30 ? ' class="on"' : ""}>${d === 365 ? "1y" : d + "d"}</button>`).join("")}</div>
          <p class="lk-until" id="lk-until"></p>
          <div class="cm-status" id="lk-status" aria-live="polite"></div>
          <div class="cm-foot"><span class="cm-hint">Two wallet steps: approve, then lock.</span><button type="button" class="cm-btn cm-btn-primary" id="lk-go">Approve &amp; lock</button></div>
          <div class="lk-list" id="lk-list"></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.documentElement.classList.add("cm-lock");
    requestAnimationFrame(() => modal.classList.add("in"));
    let days = 30;
    const until = () => { $("lk-until").innerHTML = `${ICON}<span>${tr("Unlocks on")}</span> <b>${esc(date(Math.floor(Date.now() / 1000) + days * DAY))}</b>`; };
    until();
    modal.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) return close();
      const d = e.target.closest("[data-d]");
      if (d) { days = Number(d.dataset.d); modal.querySelectorAll("[data-d]").forEach((x) => x.classList.toggle("on", x === d)); until(); }
      const p = e.target.closest("[data-p]");
      if (p && modal.__bal != null) { $("lk-amt").value = ethers.formatUnits((modal.__bal * BigInt(p.dataset.p)) / 100n, 18).replace(/\.0$/, ""); }
      const w = e.target.closest("[data-withdraw]");
      if (w) withdraw(Number(w.dataset.withdraw), w);
      const x = e.target.closest("[data-extend]");
      if (x) extend(Number(x.dataset.extend), Number(x.dataset.at), x);
    });
    modal.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    $("lk-go").addEventListener("click", () => doLock(days));
    refreshModal();
  }
  function close() {
    if (!modal) return;
    const m = modal; modal = null;
    document.documentElement.classList.remove("cm-lock");
    m.classList.remove("in"); setTimeout(() => m.remove(), 220);
  }
  async function refreshModal() {
    if (!modal || !APC.l) return;
    const l = APC.l;
    try {
      const bal = await new ethers.Contract(l.token, ERC20_ABI, readProvider()).balanceOf(state.account);
      if (!modal) return;
      modal.__bal = bal;
      $("lk-bal").textContent = `${tr("Balance")} ${fmtTok(bal)}`;
    } catch (e) { /* ignore */ }
    let locks = [];
    try { locks = await locksOf(l.token, true); } catch (e) { /* ignore */ }
    if (!modal) return;
    const mine = locks.filter((x) => lc(x.owner) === lc(state.account)).reverse();
    const now = Date.now() / 1000;
    $("lk-list").innerHTML = mine.length ? `<h3>Your locks</h3>` + mine.map((x) => {
      const ready = !x.withdrawn && x.unlockAt <= now;
      const st = x.withdrawn ? `<span class="lk-st done">Withdrawn</span>` : ready ? `<button type="button" class="cm-btn" data-withdraw="${x.id}">Withdraw</button>` : `<span class="lk-st${soon(x.unlockAt) ? " lk-soon" : ""}">${left(x.unlockAt)}</span>`;
      const ext = x.withdrawn ? "" : `<button type="button" class="cm-btn lk-ext" data-extend="${x.id}" data-at="${x.unlockAt}" title="${esc(tr("Push the unlock date 30 days later"))}">+30d</button>`;
      return `<div class="lk-row"><span class="lk-row-ico">${ICON}</span><div><b data-no-i18n>${fmtTok(x.amount)} · ${pct(x.amount)}%</b><small>${esc(date(x.unlockAt))}</small></div><div class="lk-acts">${ext}${st}</div></div>`;
    }).join("") : "";
  }
  const say = (cls, msg) => { const s = $("lk-status"); if (s) { s.className = "cm-status " + cls; s.innerHTML = msg; } };
  async function doLock(days) {
    if (busy || !modal || !APC.l) return;
    const l = APC.l;
    let amt;
    try { amt = ethers.parseUnits(($("lk-amt").value || "").trim() || "0", 18); } catch (e) { return say("bad", esc(tr("Enter an amount."))); }
    if (amt <= 0n) return say("bad", esc(tr("Enter an amount.")));
    if (modal.__bal != null && amt > modal.__bal) return say("bad", esc(tr("That's more than your balance.")));
    busy = true; $("lk-go").disabled = true;
    try {
      await ensureArcForWrite();
      if (!state.signer) throw new Error("Wallet isn't ready — reconnect and try again.");
      const tok = new ethers.Contract(l.token, ERC20_ABI, state.signer);
      const allowance = await tok.allowance(state.account, LOCK);
      if (allowance < amt) {
        say("wait", esc(tr("Step 1 of 2 — approve in your wallet…")));
        await (await tok.approve(LOCK, amt)).wait();
      }
      say("wait", esc(tr("Step 2 of 2 — confirm the lock in your wallet…")));
      const unlockAt = Math.floor(Date.now() / 1000) + days * DAY + 120;
      const lock = new ethers.Contract(LOCK, ABI, state.signer);
      await lock.lock.staticCall(l.token, amt, unlockAt);
      const tx = await lock.lock(l.token, amt, unlockAt);
      say("wait", `${esc(tr("Waiting for Arc…"))} <a href="${CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank" rel="noopener">tx ↗</a>`);
      await tx.wait();
      say("ok", esc(tr("Locked. The badge is on your coin now.")));
      sealNext = true;
      if (typeof window.arcFeedback === "function") window.arcFeedback("milestone");
      $("lk-amt").value = "";
      cache.delete(lc(l.token)); owned.clear();
      await refreshModal();
      decorate();
    } catch (err) {
      say("bad", esc(typeof apcErrText === "function" ? apcErrText(err) : (err && err.message) || "Lock failed"));
    } finally { busy = false; if ($("lk-go")) $("lk-go").disabled = false; }
  }
  // Extending only ever moves the date later (the contract refuses anything
  // else). An already-unlocked lock is re-locked for 30 days from now.
  async function extend(id, unlockAt, btn) {
    if (busy) return;
    busy = true; btn.disabled = true;
    try {
      await ensureArcForWrite();
      if (!state.signer) throw new Error("Wallet isn't ready — reconnect and try again.");
      const base = Math.max(unlockAt, Math.floor(Date.now() / 1000) + 120);
      const next = base + 30 * DAY;
      const c = new ethers.Contract(LOCK, ABI, state.signer);
      say("wait", esc(tr("Confirm the new unlock date in your wallet…")));
      await c.extend.staticCall(id, next);
      const tx = await c.extend(id, next);
      say("wait", `${esc(tr("Waiting for Arc…"))} <a href="${CONFIG.BLOCK_EXPLORER}/tx/${tx.hash}" target="_blank" rel="noopener">tx ↗</a>`);
      await tx.wait();
      say("ok", `${esc(tr("Extended — now unlocks on"))} <b>${esc(date(next))}</b>`);
      sealNext = true;
      cache.delete(lc(APC.l.token)); owned.clear();
      await refreshModal(); decorate();
    } catch (err) {
      say("bad", esc(typeof apcErrText === "function" ? apcErrText(err) : (err && err.message) || "Extend failed"));
    } finally { busy = false; if (btn.isConnected) btn.disabled = false; }
  }
  async function withdraw(id, btn) {
    if (busy) return;
    busy = true; btn.disabled = true;
    try {
      await ensureArcForWrite();
      const tx = await new ethers.Contract(LOCK, ABI, state.signer).withdraw(id);
      say("wait", esc(tr("Waiting for Arc…")));
      await tx.wait();
      say("ok", esc(tr("Withdrawn to your wallet.")));
      cache.delete(lc(APC.l.token)); owned.clear();
      await refreshModal(); decorate();
    } catch (err) {
      say("bad", esc(typeof apcErrText === "function" ? apcErrText(err) : (err && err.message) || "Withdraw failed"));
    } finally { busy = false; }
  }

  // ---------------- Portfolio: "Your locks" ----------------
  const owned = new Map(); // owner → { at, locks }
  async function locksOwnedBy(owner, fresh) {
    const k = lc(owner), c = owned.get(k);
    if (c && !fresh && Date.now() - c.at < 30e3) return c.locks;
    const ct = new ethers.Contract(LOCK, ABI, readProvider());
    const ids = (await ct.lockIdsOfOwner(owner)).slice(-40);
    const locks = await Promise.all(ids.map((id) => ct.getLock(id).then((r) => ({ id: Number(id), token: r.token, owner: r.owner, amount: r.amount, lockedAt: Number(r.lockedAt), unlockAt: Number(r.unlockAt), withdrawn: r.withdrawn }))));
    owned.set(k, { at: Date.now(), locks });
    return locks;
  }
  const pfActive = () => { const p = $("bp-panel-portfolio"); return !!(p && p.classList.contains("active")); };
  let pfSeq = 0;
  async function renderPf() {
    const box = $("pf-locks");
    if (!box) return;
    if (!state.account) { box.innerHTML = ""; return; }
    const my = ++pfSeq, acct = state.account;
    let locks;
    try { locks = await locksOwnedBy(acct); } catch (e) { return; }
    if (my !== pfSeq || lc(state.account) !== lc(acct)) return;
    const live = locks.filter((x) => !x.withdrawn).sort((a, b) => a.unlockAt - b.unlockAt);
    if (!live.length) { box.innerHTML = ""; return; }
    const launches = (typeof ARC !== "undefined" && ARC.launches) || [];
    const now = Date.now() / 1000;
    const rows = live.map((x) => {
      const l = launches.find((y) => lc(y.token) === lc(x.token));
      const sym = l ? l.symbol : `${x.token.slice(0, 6)}…${x.token.slice(-4)}`;
      const url = l && typeof l.imageUrl === "string" && /^(https:\/\/|data:image\/)/.test(l.imageUrl) ? l.imageUrl : "";
      const bg = typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(x.token) : "";
      const img = url ? `<img class="pf-logo" src="${esc(url)}" alt="">` : `<span class="pf-logo ph" style="${bg}">${esc(String(sym).replace(/^0x/, "").slice(0, 1).toUpperCase())}</span>`;
      const ready = x.unlockAt <= now;
      const st = ready ? `<span class="pf-chg lk-pf-ready">${esc(tr("Ready to withdraw"))}</span>` : `<span class="pf-chg lk-pf-left${soon(x.unlockAt) ? " lk-soon" : ""}" data-no-i18n>${left(x.unlockAt)}</span>`;
      return `<a class="pf-row lk-pf-row" href="/arc#coin/${x.token}">${img}
        <span class="pf-who"><b data-no-i18n>${l ? "$" + esc(sym) : esc(sym)}</b><small>${esc(tr("Unlocks"))} ${esc(date(x.unlockAt))}</small></span>
        <span class="pf-amt" data-no-i18n>${fmtTok(x.amount)}</span><span class="pf-val" data-no-i18n>${pct(x.amount)}%</span>${st}</a>`;
    }).join("");
    const html = `<h3 class="pf-h lk-pf-h">${ICON}<span>Your locks</span></h3>
      <div class="pf-table"><div class="pf-row pf-head"><span></span><span>Coin</span><span class="pf-amt">Amount</span><span class="pf-val">Of supply</span><span class="pf-chg">Unlocks in</span></div>${rows}</div>
      <a class="pf-note lk-pf-more" href="/arc#locker">Manage, extend or withdraw your locks in Locker →</a>`;
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "portfolio") renderPf(); });

  // ---------------- wiring ----------------
  if (typeof apcRenderHeader === "function") {
    const orig = apcRenderHeader;
    apcRenderHeader = function () { orig.apply(this, arguments); try { decorate(); } catch (e) { /* ignore */ } };
  }
  if (typeof refreshAccountDependentViews === "function") {
    const origR = refreshAccountDependentViews;
    refreshAccountDependentViews = function () { origR.apply(this, arguments); try { decorate(); if (pfActive()) renderPf(); } catch (e) { /* ignore */ } };
  }
  if (pfActive()) setTimeout(renderPf, 800);
  window.arcLock = { locksOf, activeByCreator, locksOwnedBy };
})();
