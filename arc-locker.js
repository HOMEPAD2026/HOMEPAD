/* global ethers, CONFIG, ARC, state, readProvider, withRetry, connectWallet, ensureArcForWrite, arcQuoteMeta, apcErrText, refreshAccountDependentViews */
// arc-locker.js — Locker, the first ARCIRCLE PAD utility (arcpad.html#locker).
// Lock any Arc token until a date you pick, using ArcLock (contracts/ArcLock.sol,
// already live on Arc mainnet): no owner, no admin, no fee; nobody — the
// locker included — can move tokens before the unlock time; the date can be
// pushed later but never earlier. Three parts:
//   • New lock   token → amount → duration → approve & lock (two wallet steps)
//   • Look up    every lock ever made for a token, with totals; shareable as
//                /arc#locker?token=0x…
//   • Your locks extend (+30d / +90d) or withdraw once unlocked
// v2: tranches (one approve, one lock per step), a transfer-tax check before
// signing, a certificate per lock (/lock/<id> + share card), .ics reminders,
// the share of supply as a ring, an embeddable badge (/lockbadge/<token>) and
// a live overview of every lock (/api/social?locks=overview).
// arc-lock.js keeps the creator "Locked" badge and the coin-page modal.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-locker");
  if (!panel || typeof CONFIG === "undefined" || !CONFIG.ARCLOCK_ADDRESS) return;
  const LOCK = CONFIG.ARCLOCK_ADDRESS;
  const ABI = [
    "function lock(address token, uint256 amount, uint64 unlockAt) returns (uint256)",
    "function withdraw(uint256 id)",
    "function extend(uint256 id, uint64 newUnlockAt)",
    "function lockCount() view returns (uint256)",
    "function lockIdsOfOwner(address owner) view returns (uint256[])",
    "function getLock(uint256 id) view returns (tuple(address token, address owner, uint128 amount, uint64 lockedAt, uint64 unlockAt, bool withdrawn))",
    "function locksOfToken(address token) view returns (uint256[] ids, tuple(address token, address owner, uint128 amount, uint64 lockedAt, uint64 unlockAt, bool withdrawn)[] out)",
  ];
  const LOCKED_TOPIC = ethers.id("Locked(uint256,address,address,uint256,uint64)");
  const TOK_ABI = [
    "function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)",
    "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)",
  ];
  const DAY = 86400, MIN_S = DAY, MAX_S = 3650 * DAY;
  const ARCIRCLE = String(CONFIG.ARCIRCLE_TOKEN || "").toLowerCase(); // "" while not live
  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const explorer = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const now = () => Math.floor(Date.now() / 1000);
  const date = (ts) => new Date(ts * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const isoDay = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.max(0, Math.round((b - a) / DAY));
  const leftLabel = (ts) => {
    const s = ts - now();
    if (s <= 0) return "Unlocked";
    if (s < DAY) return `${Math.max(1, Math.ceil(s / 3600))}h left`;
    return s <= 7 * DAY ? `D-${Math.ceil(s / DAY)}` : `${Math.ceil(s / DAY)}d left`;
  };
  const LOCK_ICO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/><circle cx="12" cy="15.5" r="1.4"/></svg>';
  const OPEN_ICO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 6.8-1.2"/><circle cx="12" cy="15.5" r="1.4"/></svg>';

  function fmtAmt(raw, dec) {
    const n = Number(ethers.formatUnits(raw, dec));
    if (!isFinite(n)) return "—";
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 });
  }
  function pctOf(raw, supply) {
    if (!supply || supply === 0n) return null;
    const p = Number((raw * 1000000n) / supply) / 10000;
    const t = p >= 10 ? p.toFixed(1) : p >= 1 ? p.toFixed(2) : p.toFixed(p >= 0.01 ? 3 : 4);
    return t.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") || "0";
  }
  const lockR = () => new ethers.Contract(LOCK, ABI, readProvider());

  // ---------- token info (symbol / decimals / supply / logo) ----------
  const metaCache = new Map();
  function launchOf(addr) { return ((typeof ARC !== "undefined" && ARC.launches) || []).find((l) => lc(l.token) === lc(addr)) || null; }
  async function tokenInfo(addr) {
    const k = lc(addr);
    if (metaCache.has(k)) return metaCache.get(k);
    const p = (async () => {
      const m = await arcQuoteMeta(addr);
      const supply = await withRetry(() => new ethers.Contract(m.address, TOK_ABI, readProvider()).totalSupply()).catch(() => 0n);
      const l = launchOf(m.address);
      const logo = l && typeof l.imageUrl === "string" && /^(https:\/\/|data:image\/)/.test(l.imageUrl) ? l.imageUrl
        : ARCIRCLE && k === ARCIRCLE ? "images/arcircle-mark-sm.png" : "";
      return { ...m, supply, logo, creator: l ? lc(l.creator) : null, arcpad: !!l };
    })();
    p.catch(() => metaCache.delete(k));
    metaCache.set(k, p);
    return p;
  }
  function avatar(info, addr) {
    if (info && info.logo) return `<img class="lkr-logo" src="${esc(info.logo)}" alt="">`;
    const bg = typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(addr) : "";
    const ch = info ? String(info.symbol).replace(/^\$/, "").slice(0, 1).toUpperCase() : "?";
    return `<span class="lkr-logo ph" style="${bg}">${esc(ch)}</span>`;
  }

  // ================= New lock =================
  const F = { token: null, info: null, bal: null, days: 30, custom: null, step: 0, busy: false, split: false, n: 4, gap: 30, tax: null };
  const SPLIT_N = [2, 3, 4, 6], SPLIT_GAP = [[30, "30d"], [90, "90d"], [180, "180d"]];
  const DURS = [[7, "7d"], [30, "30d"], [90, "90d"], [180, "180d"], [365, "1y"]];
  function unlockTs() {
    if (F.custom) return F.custom;
    return now() + F.days * DAY + 120; // a little slack so a slow wallet can't land under the contract's minimum
  }
  // tranches: the first unlocks on the picked date, each next one `gap` days later;
  // equal parts, the last one takes the rounding remainder
  function schedule(amt) {
    const first = unlockTs();
    if (!F.split) return [{ at: first, amount: amt }];
    const n = BigInt(F.n), part = amt / n, out = [];
    for (let i = 0; i < F.n; i++) out.push({ at: first + i * F.gap * DAY, amount: i === F.n - 1 ? amt - part * (n - 1n) : part });
    return out;
  }
  function paintSchedule(amt) {
    const box = $("lkr-sched");
    if (!box) return;
    $("lkr-split-opts").hidden = !F.split;
    if (!F.split) { box.innerHTML = ""; return; }
    const rows = schedule(amt && amt > 0n ? amt : 0n);
    const last = rows[rows.length - 1].at, t0 = now();
    const bad = last > now() + MAX_S - 60;
    box.innerHTML = rows.map((r, i) => `<li style="--i:${i};--x:${(((r.at - t0) / Math.max(1, last - t0)) * 100).toFixed(1)}%"><i>${i + 1}</i><span data-no-i18n>${esc(date(r.at))}</span><b data-no-i18n>${F.info && amt > 0n ? fmtAmt(r.amount, F.info.decimals) : Math.round(100 / F.n) + "%"}</b></li>`).join("") +
      (bad ? `<li class="bad">${esc(tr("The last tranche would be more than 10 years away — pick fewer tranches or a shorter gap."))}</li>` : "");
  }
  function renderChips() {
    const box = $("lkr-quick");
    if (!box) return;
    const chips = (ARCIRCLE ? [{ a: ARCIRCLE, s: "$ARCIRCLE" }] : []).concat([{ a: CONFIG.USDC_ADDRESS, s: "USDC" }]);
    if (state.account) {
      ((typeof ARC !== "undefined" && ARC.launches) || []).filter((l) => lc(l.creator) === lc(state.account)).slice(0, 6)
        .forEach((l) => chips.push({ a: l.token, s: "$" + l.symbol, mine: true }));
    }
    const html = chips.map((c) => `<button type="button" class="lkr-chip${c.mine ? " mine" : ""}${F.token && lc(F.token) === lc(c.a) ? " on" : ""}" data-token="${esc(c.a)}" data-no-i18n>${esc(c.s)}</button>`).join("");
    if (box.__html !== html) { box.innerHTML = html; box.__html = html; }
  }
  let pickSeq = 0;
  async function pickToken(addr) {
    const my = ++pickSeq;
    const card = $("lkr-token");
    F.token = null; F.info = null; F.bal = null;
    renderChips();
    if (!addr) { card.innerHTML = ""; card.hidden = true; paintSummary(); return; }
    card.hidden = false;
    card.innerHTML = `<div class="lkr-tok-load"><i></i><span>${esc(tr("Reading the token…"))}</span></div>`;
    try {
      const info = await tokenInfo(addr);
      if (my !== pickSeq) return;
      F.token = info.address; F.info = info;
      renderChips();
      let bal = null;
      if (state.account) bal = await withRetry(() => new ethers.Contract(info.address, TOK_ABI, readProvider()).balanceOf(state.account)).catch(() => null);
      if (my !== pickSeq) return;
      F.bal = bal;
      card.innerHTML = `${avatar(info, info.address)}<div class="lkr-tok-txt"><b data-no-i18n>$${esc(info.symbol)}</b><small data-no-i18n>${esc(info.name)} · ${short(info.address)}</small></div>
        <div class="lkr-tok-bal"><small>${esc(tr("Your balance"))}</small><b data-no-i18n>${bal == null ? "—" : fmtAmt(bal, info.decimals)}</b></div>`;
      card.classList.remove("pop"); void card.offsetWidth; card.classList.add("pop");
      const inp = $("lkr-addr");
      if (inp && lc(inp.value.trim()) !== lc(info.address)) inp.value = info.address;
    } catch (err) {
      if (my !== pickSeq) return;
      card.innerHTML = `<p class="lkr-err">${esc(tr((err && err.message) || "Couldn't read that token."))}</p>`;
    }
    paintSummary();
  }
  function amountRaw() {
    if (!F.info) return null;
    try { const v = ($("lkr-amt").value || "").replace(/,/g, "").trim(); return v ? ethers.parseUnits(v, F.info.decimals) : 0n; } catch (e) { return null; }
  }
  function paintSummary() {
    const box = $("lkr-summary"), go = $("lkr-go");
    const until = unlockTs();
    $("lkr-until").textContent = date(until);
    $("lkr-days").textContent = daysBetween(now(), until) + " " + (daysBetween(now(), until) === 1 ? "day" : "days");
    const amt = amountRaw();
    let msg = "", ok = false;
    if (!F.info) msg = "Pick a token to lock.";
    else if (amt == null) msg = "That amount isn't a number.";
    else if (amt <= 0n) msg = "Enter an amount.";
    else if (F.bal != null && amt > F.bal) msg = "That's more than your balance.";
    else ok = true;
    if (ok && F.split) {
      const sc = schedule(amt);
      if (sc[sc.length - 1].at > now() + MAX_S - 60) { ok = false; msg = "The last tranche would be more than 10 years away."; }
      else if (sc.some((x) => x.amount <= 0n)) { ok = false; msg = "That amount is too small to split."; }
    }
    paintSchedule(amt);
    if (ok) {
      const p = pctOf(amt, F.info.supply);
      const sc = schedule(amt);
      const when = F.split ? `${esc(tr("in"))} <span data-no-i18n>${sc.length}</span> ${esc(tr("tranches"))}, <span data-no-i18n>${esc(date(sc[0].at))} → ${esc(date(sc[sc.length - 1].at))}</span>`
        : `${esc(tr("locked until"))} <span data-no-i18n>${esc(date(until))}</span>`;
      box.innerHTML = `<span class="lkr-sum-ico">${LOCK_ICO}</span><div><b data-no-i18n>${fmtAmt(amt, F.info.decimals)} $${esc(F.info.symbol)}</b>${p ? ` <em data-no-i18n>${p}%</em>` : ""}<small>${when}</small></div>`;
      box.classList.add("ready");
    } else {
      box.innerHTML = `<span class="lkr-sum-ico">${LOCK_ICO}</span><div><small>${esc(tr(msg))}</small></div>`;
      box.classList.remove("ready");
    }
    // timeline: today → unlock, drawn to scale against the 1-year chip
    const bar = $("lkr-bar");
    if (bar) bar.style.setProperty("--w", Math.max(4, Math.min(100, (daysBetween(now(), until) / 365) * 100)) + "%");
    if (go && !F.busy) {
      go.disabled = state.account ? !ok : false;
      go.textContent = !state.account ? tr("Connect wallet") : F.split ? `${tr("Approve & lock")} · ${F.n} ${tr("tranches")}` : tr("Approve & lock");
    }
    queueTax(ok ? amt : null);
  }

  // ---------- transfer-tax check: "send" the amount to ArcLock in eth_call, with the
  // Token Scanner's probe contract placed at your address to measure what arrives ----------
  let taxT = null, taxSeq = 0, taxKey = "";
  function queueTax(amt) {
    const box = $("lkr-tax");
    if (!box) return;
    const key = F.info && amt && state.account ? `${F.info.address}:${amt}:${state.account}` : "";
    if (key === taxKey) return;
    taxKey = key; F.tax = null; box.hidden = true; box.innerHTML = "";
    clearTimeout(taxT);
    if (!key) return;
    const my = ++taxSeq;
    taxT = setTimeout(async () => {
      const K = window.ArcScanCore;
      if (!K || !K.PROBE_CODE || (F.bal != null && amt > F.bal)) return;
      const from = state.account;
      const data = "0xdd8e5ec9" + ethers.zeroPadValue(F.info.address, 32).slice(2) + ethers.zeroPadValue(LOCK, 32).slice(2) + ethers.toBeHex(amt, 32).slice(2);
      try {
        const out = await readProvider().send("eth_call", [{ from, to: from, data, gas: "0x1c9c380" }, "latest", { [from]: { code: K.PROBE_CODE } }]);
        if (my !== taxSeq) return;
        const [okT, sent, received] = ethers.AbiCoder.defaultAbiCoder().decode(["bool", "uint256", "uint256", "bytes"], out);
        if (!okT) { F.tax = { fail: true }; box.className = "lkr-taxnote bad"; box.innerHTML = `<b>${esc(tr("A test transfer of this amount fails."))}</b> ${esc(tr("The token may block transfers to contracts or have a max-transaction limit — the lock would fail too."))}`; box.hidden = false; return; }
        const pct = sent > 0n ? Number(((sent - received) * 10000n) / sent) / 100 : 0;
        F.tax = { pct, received };
        if (pct > 0) {
          box.className = "lkr-taxnote warn";
          box.innerHTML = `<b data-no-i18n>${pct}% ${esc(tr("transfer tax"))}</b> ${esc(tr("This token keeps part of every transfer. The lock records what actually arrives:"))} <b data-no-i18n>${fmtAmt(received, F.info.decimals)} $${esc(F.info.symbol)}</b>`;
        } else {
          box.className = "lkr-taxnote ok";
          box.innerHTML = `${esc(tr("Checked: no transfer tax — the full amount will be locked."))}`;
        }
        box.hidden = false;
      } catch (e) { /* node refuses the state override: no reading */ }
    }, 500);
  }
  function setStep(n, cls) {
    F.step = n;
    const st = $("lkr-steps");
    if (!st) return;
    st.dataset.step = String(n);
    st.classList.toggle("bad", cls === "bad");
  }
  function say(cls, html) { const s = $("lkr-status"); if (s) { s.className = "lkr-status " + (cls || ""); s.innerHTML = html || ""; } }
  async function doLock() {
    if (F.busy) return;
    if (!state.account) { if (typeof connectWallet === "function") await connectWallet(); paintSummary(); return; }
    const amt = amountRaw();
    if (!F.info || !amt || amt <= 0n) return paintSummary();
    const until = unlockTs();
    if (until < now() + MIN_S + 60 || until > now() + MAX_S - 60) return say("bad", esc(tr("Pick an unlock date between tomorrow and 10 years from now.")));
    F.busy = true;
    const go = $("lkr-go"); go.disabled = true;
    try {
      await ensureArcForWrite();
      if (!state.signer) throw new Error("Wallet isn't ready — reconnect and try again.");
      const tok = new ethers.Contract(F.info.address, TOK_ABI, state.signer);
      const plan = schedule(amt);
      const allowance = await tok.allowance(state.account, LOCK);
      if (allowance < amt) {
        setStep(1); say("wait", esc(tr("Step 1 of 2 — approve in your wallet…")));
        await (await tok.approve(LOCK, amt)).wait();
      }
      const lk = new ethers.Contract(LOCK, ABI, state.signer);
      const ids = [];
      let tx = null;
      for (let i = 0; i < plan.length; i++) {
        const part = plan[i];
        setStep(2);
        say("wait", esc(plan.length > 1 ? `${tr("Step 2 of 2 — confirm the lock in your wallet…").replace(/…$/, "")} (${i + 1}/${plan.length})…` : tr("Step 2 of 2 — confirm the lock in your wallet…")));
        await lk.lock.staticCall(F.info.address, part.amount, part.at);
        tx = await lk.lock(F.info.address, part.amount, part.at);
        say("wait", `${esc(tr("Waiting for Arc…"))} <a href="${explorer("tx", tx.hash)}" target="_blank" rel="noopener">tx ↗</a>`);
        const rc = await tx.wait();
        const ev = (rc.logs || []).find((l) => lc(l.address) === lc(LOCK) && l.topics && l.topics[0] === LOCKED_TOPIC);
        if (ev) ids.push(Number(BigInt(ev.topics[1])));
      }
      setStep(3);
      celebrate();
      vault();
      const cert = ids.length ? `${location.origin}/lock/${ids[0]}` : `${location.origin}/arc#locker?token=${F.info.address}`;
      const certs = ids.map((id) => `<a href="/lock/${id}" target="_blank" rel="noopener" data-no-i18n>#${id}</a>`).join(" ");
      say("ok", `<b>${esc(tr("Locked."))}</b> ${ids.length ? `${esc(tr(ids.length > 1 ? "Certificates:" : "Certificate:"))} ${certs}` : ""} · <a href="#locker?token=${esc(F.info.address)}" data-lkr-find="${esc(F.info.address)}">${esc(tr("see all locks for"))} <span data-no-i18n>$${esc(F.info.symbol)}</span></a>
        <button type="button" class="lkr-mini" data-copy-link="${esc(cert)}">${esc(tr("Copy link"))}</button> ${ids.length ? `<a class="lkr-mini" href="${esc(shareX(ids[0], F.info.symbol))}" target="_blank" rel="noopener">${esc(tr("Share on X"))}</a>` : ""} <a href="${explorer("tx", tx.hash)}" target="_blank" rel="noopener">tx ↗</a>`);
      loadDash(true);
      if (typeof window.arcFeedback === "function") window.arcFeedback("milestone");
      $("lkr-amt").value = "";
      mineCache = null;
      const lookupToken = F.info.address;
      await pickToken(lookupToken);
      renderMine(true);
      bumpCount();
      if (lc(($("lkr-find-addr") || {}).value) === lc(lookupToken)) lookup(lookupToken, true);
    } catch (err) {
      setStep(0, "bad");
      say("bad", esc(typeof apcErrText === "function" ? tr(apcErrText(err)) : (err && err.message) || "Lock failed"));
    } finally {
      F.busy = false;
      paintSummary();
      setTimeout(() => { if (!F.busy && F.step === 3) setStep(0); }, 6000);
    }
  }
  // the padlock in the header closes with a little bounce
  function celebrate() {
    const hero = panel.querySelector(".lkr-emblem");
    if (!hero || reduce) return;
    hero.classList.remove("snap"); void hero.offsetWidth; hero.classList.add("snap");
    setTimeout(() => hero.classList.remove("snap"), 1600);
  }

  // the vault door swings shut over the form
  function vault() {
    const v = $("lkr-vault");
    if (!v || reduce) return;
    v.hidden = false; v.classList.remove("go"); void v.offsetWidth; v.classList.add("go");
    setTimeout(() => { v.classList.remove("go"); v.hidden = true; }, 2100);
  }
  const shareX = (id, sym) => `https://x.com/intent/post?text=${encodeURIComponent(`$${sym} is locked on ARCIRCLE PAD — nobody can move it before the date.`)}&url=${encodeURIComponent(`${location.origin}/lock/${id}`)}`;
  // a calendar reminder for the unlock (and a day before it)
  function ics(l, sym) {
    const d = (ts) => new Date(ts * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ARCIRCLE PAD//Locker//EN", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      `UID:arclock-${l.id}@arcircle.app`, `DTSTAMP:${d(now())}`, `DTSTART:${d(l.unlockAt)}`, `DTEND:${d(l.unlockAt + 1800)}`,
      `SUMMARY:${sym} lock #${l.id} unlocks`, `DESCRIPTION:ArcLock #${l.id} on Arc can be withdrawn from now on. https://www.arcircle.app/lock/${l.id}`,
      `URL:https://www.arcircle.app/lock/${l.id}`, "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Lock unlocks tomorrow", "TRIGGER:-P1D", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
    a.download = `arclock-${l.id}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  // share of supply as a ring
  function ring(p) {
    const v = Math.max(0, Math.min(100, Number(p) || 0)), C = 2 * Math.PI * 20;
    return `<svg class="lkr-ring" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" class="bg"/><circle cx="24" cy="24" r="20" class="fg" style="--d:${((C * v) / 100).toFixed(2)};--c:${C.toFixed(2)}"/></svg>`;
  }

  // ================= Look up a token =================
  let findSeq = 0;
  async function lookup(addr, fresh) {
    const out = $("lkr-find-out");
    const my = ++findSeq;
    addr = String(addr || "").trim();
    if (!ethers.isAddress(addr)) { out.innerHTML = `<p class="lkr-err">${esc(tr("Paste a token contract address (0x…)."))}</p>`; return; }
    out.innerHTML = `<div class="lkr-tok-load"><i></i><span>${esc(tr("Reading every lock for this token…"))}</span></div>`;
    try {
      const [info, r] = await Promise.all([tokenInfo(addr), withRetry(() => lockR().locksOfToken(addr))]);
      if (my !== findSeq) return;
      const t = now();
      const locks = r[0].map((id, i) => ({ id: Number(id), owner: lc(r[1][i].owner), amount: r[1][i].amount, lockedAt: Number(r[1][i].lockedAt), unlockAt: Number(r[1][i].unlockAt), withdrawn: r[1][i].withdrawn }));
      const active = locks.filter((l) => !l.withdrawn && l.unlockAt > t);
      const total = active.reduce((s, l) => s + l.amount, 0n);
      const next = active.length ? Math.min(...active.map((l) => l.unlockAt)) : 0;
      const p = pctOf(total, info.supply);
      const who = (o) => (state.account && o === lc(state.account) ? `<em class="lkr-tag you">${esc(tr("You"))}</em>` : info.creator && o === info.creator ? `<em class="lkr-tag creator">${esc(tr("Creator"))}</em>` : "");
      const rows = locks.slice().sort((a, b) => (a.withdrawn - b.withdrawn) || (a.unlockAt - b.unlockAt)).slice(0, 60).map((l, i) => {
        const st = l.withdrawn ? `<span class="lkr-st done">${esc(tr("Withdrawn"))}</span>` : l.unlockAt <= t ? `<span class="lkr-st open">${esc(tr("Unlocked"))}</span>`
          : `<span class="lkr-st${l.unlockAt - t <= 7 * DAY ? " soon" : ""}" data-no-i18n>${esc(leftLabel(l.unlockAt))}</span>`;
        const prog = l.withdrawn ? 100 : Math.max(0, Math.min(100, ((t - l.lockedAt) / Math.max(1, l.unlockAt - l.lockedAt)) * 100));
        return `<div class="lkr-row" data-lock="${l.id}" style="--i:${Math.min(i, 12)}"><span class="lkr-row-ico${l.withdrawn || l.unlockAt <= t ? " open" : ""}">${l.withdrawn || l.unlockAt <= t ? OPEN_ICO : LOCK_ICO}</span>
          <div class="lkr-row-main"><b data-no-i18n>${fmtAmt(l.amount, info.decimals)}${pctOf(l.amount, info.supply) ? ` <em>${pctOf(l.amount, info.supply)}%</em>` : ""}</b>
          <small><a href="${explorer("address", l.owner)}" target="_blank" rel="noopener" data-no-i18n>${short(l.owner)}</a>${who(l.owner)} · <span data-no-i18n>${esc(date(l.unlockAt))}</span> · <a href="/lock/${l.id}" target="_blank" rel="noopener" data-no-i18n>#${l.id}</a></small>
          <span class="lkr-prog"><i style="--p:${prog.toFixed(1)}%"></i></span></div>${st}</div>`;
      }).join("");
      const html = `<div class="lkr-find-head">${avatar(info, info.address)}<div><b data-no-i18n>$${esc(info.symbol)}</b><small data-no-i18n>${esc(info.name)} · <a href="${explorer("token", info.address)}" target="_blank" rel="noopener">${short(info.address)} ↗</a></small></div>
          <button type="button" class="lkr-mini" data-copy-link="${esc(location.origin + "/arc#locker?token=" + info.address)}">${esc(tr("Copy link"))}</button></div>
        <div class="lkr-find-stats">
          <div class="lkr-ringcell">${ring(p)}<div><small>${esc(tr("Locked now"))}</small><b data-no-i18n>${total > 0n ? fmtAmt(total, info.decimals) : "0"}</b>${p ? `<em data-no-i18n>${p}% ${esc(tr("of supply"))}</em>` : ""}</div></div>
          <div><small>${esc(tr("Active locks"))}</small><b data-no-i18n>${active.length}</b><em data-no-i18n>${locks.length} ${esc(tr("ever"))}</em></div>
          <div><small>${esc(tr("Next unlock"))}</small><b data-no-i18n>${next ? esc(date(next)) : "—"}</b>${next ? `<em data-no-i18n>${esc(leftLabel(next))}</em>` : ""}</div>
        </div>
        ${locks.length ? `<div class="lkr-rows">${rows}</div>` : `<p class="lkr-empty">${esc(tr("No one has locked this token yet."))}</p>`}
        ${active.length ? embedBox(info) : ""}
        ${info.arcpad ? `<a class="lkr-coin-link" href="/arc#coin/${esc(info.address)}">${esc(tr("Open the coin on ArcPad →"))}</a>` : ""}`;
      out.innerHTML = html;
      const hl = /[?&]lock=(\d+)/.exec(location.hash);
      if (hl) { const row = out.querySelector(`[data-lock="${hl[1]}"]`); if (row) { row.classList.add("hl"); setTimeout(() => row.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }), 250); } }
      if (!reduce) { const f = out.querySelector(".lkr-ring .fg"); if (f) { f.classList.add("from0"); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove("from0"))); } }
      if (!reduce) out.querySelectorAll(".lkr-prog i").forEach((el) => { el.style.width = "0"; requestAnimationFrame(() => requestAnimationFrame(() => { el.style.width = ""; })); });
      if (history.replaceState && location.hash.split("?")[0] === "#locker" && !/[?&]lock=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search + "#locker?token=" + info.address);
    } catch (err) {
      if (my !== findSeq) return;
      out.innerHTML = `<p class="lkr-err">${esc(tr((err && err.message) || "Couldn't read locks right now."))}</p>`;
    }
  }

  // "Locked on ARCIRCLE" badge for a project's site or README
  function embedBox(info) {
    const src = `${location.origin}/lockbadge/${info.address}`, href = `${location.origin}/arc#locker?token=${info.address}`;
    const md = `[![Locked on ARCIRCLE](${src})](${href})`;
    const htm = `<a href="${href}"><img src="${src}" alt="Locked on ARCIRCLE"></a>`;
    return `<details class="lkr-embed"><summary>${esc(tr("Embed a badge on your site"))}</summary>
      <div class="lkr-embed-in"><img src="/lockbadge/${esc(info.address)}" alt="" loading="lazy" height="22">
      <div class="lkr-embed-code"><code data-no-i18n>${esc(md)}</code><button type="button" class="lkr-mini" data-copy-link="${esc(md)}">${esc(tr("Copy Markdown"))}</button></div>
      <div class="lkr-embed-code"><code data-no-i18n>${esc(htm)}</code><button type="button" class="lkr-mini" data-copy-link="${esc(htm)}">${esc(tr("Copy HTML"))}</button></div>
      <small>${esc(tr("It updates by itself: the share of supply locked and the last unlock date."))}</small></div></details>`;
  }

  // ================= Your locks =================
  let mineCache = null, mineSeq = 0;
  async function renderMine(fresh) {
    const box = $("lkr-mine");
    if (!box) return;
    if (!state.account) {
      box.innerHTML = `<div class="lkr-empty-cta"><span>${LOCK_ICO}</span><p>${esc(tr("Connect a wallet to see and manage your locks."))}</p><button type="button" class="lkr-btn ghost" data-lkr-connect>${esc(tr("Connect wallet"))}</button></div>`;
      return;
    }
    const acct = lc(state.account), my = ++mineSeq;
    if (!mineCache || fresh || mineCache.acct !== acct) {
      box.innerHTML = `<div class="lkr-tok-load"><i></i><span>${esc(tr("Loading your locks…"))}</span></div>`;
      try {
        const c = lockR();
        const ids = (await withRetry(() => c.lockIdsOfOwner(acct))).slice(-60);
        const locks = await Promise.all(ids.map((id) => withRetry(() => c.getLock(id)).then((r) => ({ id: Number(id), token: r.token, amount: r.amount, lockedAt: Number(r.lockedAt), unlockAt: Number(r.unlockAt), withdrawn: r.withdrawn }))));
        const infos = await Promise.all([...new Set(locks.map((l) => lc(l.token)))].map((a) => tokenInfo(a).then((i) => [a, i]).catch(() => [a, null])));
        mineCache = { acct, locks, info: new Map(infos) };
      } catch (err) {
        if (my === mineSeq) box.innerHTML = `<p class="lkr-err">${esc(tr("Couldn't read your locks right now."))}</p>`;
        return;
      }
    }
    if (my !== mineSeq || lc(state.account) !== acct) return;
    const t = now();
    const rank = (l) => (l.withdrawn ? 2 : l.unlockAt <= t ? 0 : 1); // ready to withdraw first, then by date, withdrawn last
    const locks = mineCache.locks.slice().sort((a, b) => (rank(a) - rank(b)) || (a.unlockAt - b.unlockAt));
    if (!locks.length) {
      box.innerHTML = `<div class="lkr-empty-cta"><span>${LOCK_ICO}</span><p>${esc(tr("You haven't locked anything yet."))}</p><button type="button" class="lkr-btn ghost" data-lkr-new>${esc(tr("Lock a token"))}</button></div>`;
      const b = box.querySelector("[data-lkr-new]");
      if (b) b.addEventListener("click", () => { const n = document.querySelector(".lkr-new"); if (n) n.scrollIntoView({ behavior: "smooth", block: "start" }); setTimeout(() => { const i = $("lkr-addr"); if (i) i.focus({ preventScroll: true }); }, 400); });
      return;
    }
    box.innerHTML = `<div class="lkr-rows">` + locks.map((l, i) => {
      const info = mineCache.info.get(lc(l.token));
      const dec = info ? info.decimals : 18, sym = info ? "$" + info.symbol : short(l.token);
      const ready = !l.withdrawn && l.unlockAt <= t;
      const prog = l.withdrawn ? 100 : Math.max(0, Math.min(100, ((t - l.lockedAt) / Math.max(1, l.unlockAt - l.lockedAt)) * 100));
      const acts = l.withdrawn ? `<span class="lkr-st done">${esc(tr("Withdrawn"))}</span>`
        : `<div class="lkr-acts">${ready ? `<button type="button" class="lkr-btn sm lkr-wd" data-withdraw="${l.id}">${OPEN_ICO}${esc(tr("Withdraw"))}</button>` : `<span class="lkr-st${l.unlockAt - t <= 7 * DAY ? " soon" : ""}" data-no-i18n>${esc(leftLabel(l.unlockAt))}</span>`}
            <button type="button" class="lkr-mini" data-extend="${l.id}" data-at="${l.unlockAt}" data-add="30">+30d</button><button type="button" class="lkr-mini" data-extend="${l.id}" data-at="${l.unlockAt}" data-add="90">+90d</button>
            ${ready ? "" : `<button type="button" class="lkr-mini" data-ics="${l.id}" title="${esc(tr("Add the unlock date to your calendar"))}">${esc(tr("Calendar"))}</button>`}
            <button type="button" class="lkr-mini" data-copy-link="${esc(location.origin + "/lock/" + l.id)}">${esc(tr("Copy link"))}</button></div>`;
      return `<div class="lkr-row${ready ? " ready" : ""}" data-lock="${l.id}" style="--i:${Math.min(i, 12)}">${avatar(info, l.token)}
        <div class="lkr-row-main"><b data-no-i18n>${fmtAmt(l.amount, dec)} ${esc(sym)} <a class="lkr-id" href="/lock/${l.id}" target="_blank" rel="noopener">#${l.id}</a></b>
          <small>${esc(l.withdrawn ? tr("Withdrawn") : ready ? tr("Unlocked on") : tr("Unlocks on"))} <span data-no-i18n>${esc(date(l.unlockAt))}</span> · <a href="#locker?token=${esc(l.token)}" data-lkr-find="${esc(l.token)}">${esc(tr("all locks"))}</a></small>
          <span class="lkr-prog lkr-tl${ready ? " full" : ""}"><i style="--p:${prog.toFixed(1)}%"></i>${l.withdrawn || ready ? "" : `<u style="--p:${prog.toFixed(1)}%"></u>`}</span>
          <span class="lkr-tl-d" data-no-i18n><span>${esc(date(l.lockedAt))}</span><span>${esc(date(l.unlockAt))}</span></span></div>${acts}</div>`;
    }).join("") + `</div><p class="lkr-note-sm">${esc(tr("Extending only ever moves the date later. An unlocked lock that you extend is locked again from today."))}</p>`;
  }
  async function extendLock(btn) {
    if (F.busy) return;
    const id = Number(btn.dataset.extend), at = Number(btn.dataset.at), add = Number(btn.dataset.add) || 30;
    F.busy = true; btn.disabled = true;
    const note = $("lkr-mine-status");
    const put = (cls, h) => { if (note) { note.className = "lkr-status " + cls; note.innerHTML = h; } };
    try {
      await ensureArcForWrite();
      if (!state.signer) throw new Error("Wallet isn't ready — reconnect and try again.");
      const next = Math.max(at, now() + 120) + add * DAY;
      const c = new ethers.Contract(LOCK, ABI, state.signer);
      put("wait", esc(tr("Confirm the new unlock date in your wallet…")));
      await c.extend.staticCall(id, next);
      const tx = await c.extend(id, next);
      put("wait", `${esc(tr("Waiting for Arc…"))} <a href="${explorer("tx", tx.hash)}" target="_blank" rel="noopener">tx ↗</a>`);
      await tx.wait();
      put("ok", `${esc(tr("Extended — now unlocks on"))} <b data-no-i18n>${esc(date(next))}</b>`);
      celebrate();
      const oldRow = document.querySelector(`#lkr-mine [data-lock="${id}"] .lkr-prog i`);
      const oldW = oldRow ? oldRow.style.getPropertyValue("--p") : "";
      await renderMine(true);
      const row = document.querySelector(`#lkr-mine [data-lock="${id}"]`);
      if (row && !reduce) {
        row.classList.add("stretched");
        const bar = row.querySelector(".lkr-prog i");
        if (bar && oldW) { const nw = bar.style.getPropertyValue("--p"); bar.style.width = oldW; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = nw; })); }
        setTimeout(() => row.classList.remove("stretched"), 1600);
      }
    } catch (err) {
      put("bad", esc(typeof apcErrText === "function" ? tr(apcErrText(err)) : (err && err.message) || "Extend failed"));
    } finally { F.busy = false; if (btn.isConnected) btn.disabled = false; }
  }
  async function withdrawLock(btn) {
    if (F.busy) return;
    const id = Number(btn.dataset.withdraw);
    F.busy = true; btn.disabled = true;
    const note = $("lkr-mine-status");
    const put = (cls, h) => { if (note) { note.className = "lkr-status " + cls; note.innerHTML = h; } };
    try {
      await ensureArcForWrite();
      const tx = await new ethers.Contract(LOCK, ABI, state.signer).withdraw(id);
      put("wait", `${esc(tr("Waiting for Arc…"))} <a href="${explorer("tx", tx.hash)}" target="_blank" rel="noopener">tx ↗</a>`);
      await tx.wait();
      put("ok", esc(tr("Withdrawn to your wallet.")));
      const row = btn.closest(".lkr-row");
      if (row && !reduce) { row.classList.add("opening"); await new Promise((r) => setTimeout(r, 900)); }
      await renderMine(true);
      loadDash(true);
    } catch (err) {
      put("bad", esc(typeof apcErrText === "function" ? tr(apcErrText(err)) : (err && err.message) || "Withdraw failed"));
    } finally { F.busy = false; if (btn.isConnected) btn.disabled = false; }
  }

  // ================= overview: every lock, by token =================
  let dashAt = 0, dashBusy = false;
  async function loadDash(force) {
    const top = $("lkr-dash-top");
    if (!top || dashBusy || (!force && Date.now() - dashAt < 60e3)) return;
    dashBusy = true;
    try {
      const r = await fetch("/api/social?locks=overview", { cache: force ? "no-store" : "default" });
      const d = r.ok ? await r.json() : null;
      if (!d || d.error) throw new Error("overview");
      dashAt = Date.now();
      paintDash(d);
    } catch (e) {
      if (!dashAt) top.innerHTML = `<p class="lkr-empty">${esc(tr("Couldn't read the overview right now."))}</p>`;
    } finally { dashBusy = false; }
  }
  const usdFmt = (v) => (window.arcFmt && window.arcFmt.usd ? window.arcFmt.usd(v) : "$" + Math.round(v).toLocaleString("en-US"));
  function paintDash(d) {
    const cells = [[tr("Locked value"), d.tvlUsd != null ? usdFmt(d.tvlUsd) : "—", d.tvlUsd != null ? tr("priced tokens only") : ""], [tr("Active locks"), d.activeLocks], [tr("Tokens locked"), d.tokens], [tr("Locks ever"), d.locksEver]];
    const st = $("lkr-dash-stats");
    st.innerHTML = cells.map(([k, v, sub]) => `<div><small>${esc(k)}</small><b data-no-i18n data-v="${esc(v)}">${esc(v)}</b>${sub ? `<em>${esc(sub)}</em>` : ""}</div>`).join("");
    if (typeof window.arcCountUp === "function" && !reduce) st.querySelectorAll("b").forEach((b) => { const n = Number(b.dataset.v); if (Number.isFinite(n) && n > 0) window.arcCountUp(b, n, (x) => String(Math.round(x))); });
    const logo = (m) => { const l = launchOf(m.address); const ok = l && typeof l.imageUrl === "string" && /^(https:\/\/|data:image\/)/.test(l.imageUrl); return avatar(ok ? { logo: l.imageUrl } : ARCIRCLE && lc(m.address) === ARCIRCLE ? { logo: "images/arcircle-mark-sm.png" } : { symbol: m.symbol }, m.address); };
    const pc = (p) => (p == null ? "" : `${(p >= 10 ? p.toFixed(1) : p >= 1 ? p.toFixed(2) : p.toFixed(3)).replace(/\.?0+$/, "")}%`);
    const t = now();
    $("lkr-dash-top").innerHTML = d.top.length ? `<div class="lkr-rank">${d.top.map((x, i) => `<button type="button" class="lkr-rank-row" data-lkr-find="${esc(x.token.address)}" style="--i:${i};--w:${Math.max(2, Math.min(100, x.pctOfSupply || 0))}%">
        <span class="n" data-no-i18n>${i + 1}</span>${logo(x.token)}<span class="m"><b data-no-i18n>$${esc(x.token.symbol)}</b><small data-no-i18n>${fmtAmt(BigInt(x.locked), x.token.decimals)} · ${x.active} ${esc(tr(x.active === 1 ? "active lock" : "active locks"))}</small><i></i></span>
        <span class="v" data-no-i18n><b>${esc(pc(x.pctOfSupply) || "—")}</b><small>${x.usd != null ? esc(usdFmt(x.usd)) : esc(tr("of supply"))}</small></span></button>`).join("")}</div>`
      : `<p class="lkr-empty">${esc(tr("Nothing is locked right now."))}</p>`;
    $("lkr-dash-soon").innerHTML = d.soon.length ? `<div class="lkr-soon">${d.soon.map((l, i) => `<a class="lkr-soon-row" href="#locker?token=${esc(l.token)}&lock=${l.id}" data-lkr-find="${esc(l.token)}" data-lkr-lock="${l.id}" style="--i:${i}">
        <span class="d" data-no-i18n><b>${new Date(l.unlockAt * 1000).getDate()}</b><small>${new Date(l.unlockAt * 1000).toLocaleDateString("en-US", { month: "short" })}</small></span>
        <span class="m"><b data-no-i18n>${fmtAmt(BigInt(l.amount), l.decimals)} $${esc(l.symbol)}</b><small data-no-i18n>${pc(l.pctOfSupply) ? pc(l.pctOfSupply) + " · " : ""}#${l.id}</small></span>
        <span class="lkr-st${l.unlockAt - t <= 7 * DAY ? " soon" : ""}" data-no-i18n>${esc(leftLabel(l.unlockAt))}</span></a>`).join("")}</div>`
      : `<p class="lkr-empty">${esc(tr("No lock ends in the next 30 days."))}</p>`;
  }

  // ================= header numbers =================
  let countShown = null;
  async function bumpCount() {
    const el = $("lkr-count");
    if (!el) return;
    try {
      const n = Number(await withRetry(() => lockR().lockCount()));
      if (typeof window.arcCountUp === "function" && countShown !== n) window.arcCountUp(el, n, (v) => String(Math.round(v)));
      else el.textContent = String(n);
      countShown = n;
    } catch (e) { /* stays — */ }
  }

  // ================= wiring =================
  function init() {
    const ct = $("lkr-contract");
    if (ct) ct.href = explorer("address", LOCK);
    // durations
    const durs = $("lkr-durs");
    durs.innerHTML = DURS.map(([d, l]) => `<button type="button" class="lkr-chip${d === F.days ? " on" : ""}" data-d="${d}">${l}</button>`).join("") +
      `<label class="lkr-chip lkr-cal"><span>${esc(tr("Pick a date"))}</span><input type="date" id="lkr-date" aria-label="${esc(tr("Unlock date"))}"></label>`;
    const dateIn = $("lkr-date");
    const setBounds = () => { dateIn.min = isoDay(now() + 2 * DAY); dateIn.max = isoDay(now() + MAX_S - 2 * DAY); };
    setBounds();
    panel.addEventListener("click", (e) => {
      const t = e.target;
      const d = t.closest("[data-d]");
      if (d) {
        F.days = Number(d.dataset.d); F.custom = null; dateIn.value = "";
        durs.querySelectorAll(".lkr-chip").forEach((x) => x.classList.toggle("on", x === d));
        paintSummary(); return;
      }
      const chip = t.closest("[data-token]");
      if (chip) { $("lkr-addr").value = chip.dataset.token; pickToken(chip.dataset.token); return; }
      const pc = t.closest("[data-pct]");
      if (pc && F.info && F.bal != null) {
        $("lkr-amt").value = ethers.formatUnits((F.bal * BigInt(pc.dataset.pct)) / 100n, F.info.decimals).replace(/\.0$/, "");
        paintSummary(); return;
      }
      const fl = t.closest("[data-lkr-find]");
      if (fl) {
        e.preventDefault();
        if (fl.dataset.lkrLock && history.replaceState) history.replaceState(null, "", location.pathname + location.search + `#locker?token=${fl.dataset.lkrFind}&lock=${fl.dataset.lkrLock}`);
        $("lkr-find-addr").value = fl.dataset.lkrFind; lookup(fl.dataset.lkrFind); $("lkr-find").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); return;
      }
      const sn = t.closest("[data-split-n]");
      if (sn) { F.n = Number(sn.dataset.splitN); $("lkr-split-n").querySelectorAll(".lkr-chip").forEach((x) => x.classList.toggle("on", x === sn)); paintSummary(); return; }
      const sg = t.closest("[data-split-gap]");
      if (sg) { F.gap = Number(sg.dataset.splitGap); $("lkr-split-gap").querySelectorAll(".lkr-chip").forEach((x) => x.classList.toggle("on", x === sg)); paintSummary(); return; }
      const ic = t.closest("[data-ics]");
      if (ic && mineCache) {
        const l = mineCache.locks.find((x) => x.id === Number(ic.dataset.ics));
        const info = l && mineCache.info.get(lc(l.token));
        if (l) ics(l, info ? "$" + info.symbol : "Token");
        return;
      }
      const cp = t.closest("[data-copy-link]");
      if (cp) {
        const txt = cp.dataset.copyLink;
        const was = cp.textContent;
        (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
          () => { cp.textContent = tr("Copied"); setTimeout(() => { cp.textContent = was; }, 1500); },
          () => { cp.textContent = tr("Copy failed"); });
        return;
      }
      if (t.closest("[data-lkr-connect]")) { if (typeof connectWallet === "function") connectWallet(); return; }
      const ex = t.closest("[data-extend]");
      if (ex) { extendLock(ex); return; }
      const wd = t.closest("[data-withdraw]");
      if (wd) { withdrawLock(wd); }
    });
    dateIn.addEventListener("change", () => {
      if (!dateIn.value) { F.custom = null; paintSummary(); return; }
      const ts = Math.floor(new Date(dateIn.value + "T12:00:00").getTime() / 1000);
      F.custom = Math.max(now() + MIN_S + 3600, Math.min(now() + MAX_S - 3600, ts));
      durs.querySelectorAll(".lkr-chip[data-d]").forEach((x) => x.classList.remove("on"));
      dateIn.closest(".lkr-cal").classList.add("on");
      paintSummary();
    });
    let addrT;
    $("lkr-addr").addEventListener("input", (e) => {
      clearTimeout(addrT);
      const v = e.target.value.trim();
      addrT = setTimeout(() => { if (!v) pickToken(null); else if (ethers.isAddress(v)) pickToken(v); }, 250);
    });
    $("lkr-amt").addEventListener("input", paintSummary);
    $("lkr-go").addEventListener("click", doLock);
    $("lkr-find-form").addEventListener("submit", (e) => { e.preventDefault(); lookup($("lkr-find-addr").value); });
    $("lkr-split-n").innerHTML = SPLIT_N.map((n) => `<button type="button" class="lkr-chip sm${n === F.n ? " on" : ""}" data-split-n="${n}" data-no-i18n>${n}</button>`).join("");
    $("lkr-split-gap").innerHTML = SPLIT_GAP.map(([d, l]) => `<button type="button" class="lkr-chip sm${d === F.gap ? " on" : ""}" data-split-gap="${d}" data-no-i18n>${l}</button>`).join("");
    $("lkr-split-on").addEventListener("change", (e) => { F.split = e.target.checked; paintSummary(); });
    const pcts = $("lkr-pcts");
    pcts.innerHTML = [25, 50, 75, 100].map((p) => `<button type="button" class="lkr-chip sm" data-pct="${p}">${p === 100 ? "Max" : p + "%"}</button>`).join("");
    renderChips();
    paintSummary();
  }
  let booted = false;
  function onShow() {
    if (!booted) { booted = true; init(); }
    bumpCount();
    renderChips();
    renderMine();
    loadDash();
    const m = /[?&]token=(0x[0-9a-fA-F]{40})/.exec(location.hash);
    if (m) { $("lkr-find-addr").value = m[1]; lookup(m[1]); }
  }
  const active = () => panel.classList.contains("active");
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "locker") onShow(); });
  if (active()) onShow();
  // wallet changes → balances, "your coins" chips, your locks
  if (typeof refreshAccountDependentViews === "function") {
    const orig = refreshAccountDependentViews;
    // eslint-disable-next-line no-global-assign
    refreshAccountDependentViews = function () {
      orig.apply(this, arguments);
      try { if (booted) { renderChips(); if (F.token) pickToken(F.token); else paintSummary(); if (active()) renderMine(true); } } catch (e) { /* ignore */ }
    };
  }
  setInterval(() => { if (booted && active() && !document.hidden) { paintSummary(); } }, 60000);
})();
