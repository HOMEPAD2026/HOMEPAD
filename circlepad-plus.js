/* global ethers, CONFIG, state, applyCirclepadState, renderCirclepadLeaderboard, connectWallet, readProvider, _circlepadDeadline */
// circlepad-plus.js — the contribution flow, the transparency dashboard and
// the "circle" moments for CirclePad. circlepad.js still owns the escrow
// reads and the contribute transaction; this file only adds around them:
//   • amount chips (10 / 50 / 100 / Max) and a live "your share would be"
//     preview; on phones a sticky bar and a bottom sheet to contribute
//   • after a contribution: the share card flips over — member number,
//     amount, share, invite link, X / image
//   • "opens at" countdown and calendar files for the opening (when
//     CONFIG.CIRCLEPAD_OPENS_AT is set) — the close one lives in circlepad.js
//   • Transparency: the escrow's live balance, source-verified badge, the
//     three payout wallets, net raised hour by hour, wallets / median /
//     Lorenz curve, and what happens after the close
//   • The Circle: every contributor as a dot on slowly turning orbits, new
//     ones flying in; a live feed of who just joined; my rank pinned on the
//     leaderboard
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !document.getElementById("bp-round-panel")) return;
  const $ = (id) => document.getElementById(id);
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lc = (a) => String(a || "").toLowerCase();
  const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const toNum = (w) => { try { return Number(ethers.formatEther(BigInt(w || 0))); } catch { return 0; } };
  const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M" : n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 0 : 2 }));
  const sh = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
  const hue = (a) => (parseInt(String(a).slice(2, 8), 16) || 0) % 360;
  const ex = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
  const ESCROW = String(CONFIG.CIRCLEPAD_ESCROW_ADDRESS || "");
  const me = () => (state && state.account ? lc(state.account) : "");
  const loc = () => { const l = window.arcI18n && window.arcI18n.get(); return l === "ko" ? "ko-KR" : l === "zh" ? "zh-CN" : "en-US"; };
  const when = (ts) => new Date(ts * 1000).toLocaleString(loc(), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const inviteUrl = (w) => `https://www.arcircle.app/circle?ref=${w}`;
  const cardUrl = (w) => `https://www.arcircle.app/round${w ? `?w=${w}` : ""}`;

  let S = null, rows = [], activity = [], firstLb = true, wallets = null;

  // ================= amount chips + share preview =================
  // the desktop input already has its own Max button next to it, so the chips there skip it
  function chipsHtml(id, withMax = true) {
    return `<div class="cpx-chips" id="${id}">${[10, 50, 100].map((v) => `<button type="button" data-amt="${v}" data-no-i18n>${v}</button>`).join("")}${withMax ? `<button type="button" data-amt="max">${esc(tr("Max"))}</button>` : ""}</div><p class="cpx-preview" id="${id}-p" aria-live="polite"></p>`;
  }
  function preview(val, el) {
    if (!el || !S) return;
    const x = Number(String(val || "").replace(/,/g, "")) || 0;
    if (!S.isOpen || !(x > 0)) { el.innerHTML = ""; el.classList.remove("on"); return; }
    const total = toNum(S.totalRaised), mine = toNum(S.myContribution || 0n);
    const share = ((mine + x) / (total + x)) * 100;
    const order = window.circlepadLbExtra && window.circlepadLbExtra.joinOrder;
    const joined = order ? order.length : rows.length;
    const isNew = !(mine > 0);
    el.innerHTML = `${esc(tr("Your share after this"))} <b data-no-i18n>${share >= 10 ? share.toFixed(1) : share.toFixed(2)}%</b> <span>${esc(tr("of"))} <span data-no-i18n>${fmt(total + x)} USDC</span></span>${isNew ? ` · <span>${esc(tr(`member #${joined + 1}`))}</span>` : ""}`;
    el.classList.add("on");
  }
  async function maxAmount() {
    if (!state.account && typeof connectWallet === "function") { try { await connectWallet(); } catch { /* cancelled */ } }
    if (!state.account) return null;
    const bal = await readProvider().getBalance(state.account).catch(() => null);
    if (bal == null) return null;
    const buf = ethers.parseEther("0.05");
    const v = bal > buf ? bal - buf : 0n;
    return String(Math.floor(Number(ethers.formatEther(v)) * 100) / 100);
  }
  function wireChips(box, input, prev) {
    box.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-amt]");
      if (!b) return;
      box.querySelectorAll("[data-amt]").forEach((x) => x.classList.toggle("on", x === b));
      input.value = b.dataset.amt === "max" ? (await maxAmount()) || input.value : b.dataset.amt;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (!reduce) { input.classList.remove("cpx-pop"); void input.offsetWidth; input.classList.add("cpx-pop"); }
    });
    input.addEventListener("input", () => {
      preview(input.value, prev);
      box.querySelectorAll("[data-amt]").forEach((x) => x.classList.toggle("on", x.dataset.amt === input.value));
    });
  }
  (function mountChips() {
    const row = $("bp-contribute-row"), input = $("bp-contribute-amount");
    if (!row || !input) return;
    row.insertAdjacentHTML("afterend", chipsHtml("cpx-chips", !$("bp-contribute-max")));
    wireChips($("cpx-chips"), input, $("cpx-chips-p"));
  })();

  // ================= phones: sticky bar + bottom sheet =================
  const bar = document.createElement("div");
  bar.className = "cpx-bar"; bar.id = "cpx-bar"; bar.hidden = true;
  bar.innerHTML = `<span class="cpx-bar-dot"></span><span class="cpx-bar-t"><b data-no-i18n id="cpx-bar-amt"></b><small id="cpx-bar-time" data-no-i18n></small></span><button type="button" class="cpx-bar-go" id="cpx-bar-go">${esc(tr("Contribute"))}</button>`;
  document.body.appendChild(bar);
  const sheet = document.createElement("div");
  sheet.className = "cpx-sheet"; sheet.id = "cpx-sheet"; sheet.hidden = true;
  sheet.innerHTML = `<div class="cpx-sheet-bg" data-close></div>
    <div class="cpx-sheet-box" role="dialog" aria-modal="true" aria-labelledby="cpx-sheet-h">
      <i class="cpx-grab" aria-hidden="true"></i>
      <h3 id="cpx-sheet-h">${esc(tr("Join the circle"))}</h3>
      <p class="cpx-sheet-bal" id="cpx-sheet-bal"></p>
      <div class="cpx-sheet-in"><input id="cpx-sheet-amt" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" aria-label="${esc(tr("USDC amount"))}"><span>USDC</span></div>
      ${chipsHtml("cpx-sheet-chips")}
      <button type="button" class="bp-btn-primary bp-btn-block cpx-sheet-go" id="cpx-sheet-go">${esc(tr("Contribute USDC"))}</button>
      <p class="cpx-sheet-note">${esc(tr("You can withdraw your own USDC any time before the raise closes."))}</p>
    </div>`;
  document.body.appendChild(sheet);
  wireChips($("cpx-sheet-chips"), $("cpx-sheet-amt"), $("cpx-sheet-chips-p"));
  function openSheet() {
    if (!S || !S.isOpen) return;
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add("in"));
    $("cpx-sheet-bal").innerHTML = state.account && S.myWalletBalance != null ? `${esc(tr("Balance"))} <b data-no-i18n>${fmt(toNum(S.myWalletBalance))} USDC</b>` : esc(tr("Connect your wallet to contribute."));
    setTimeout(() => $("cpx-sheet-amt").focus(), 250);
  }
  function closeSheet() { sheet.classList.remove("in"); setTimeout(() => { sheet.hidden = true; }, 280); }
  sheet.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });
  $("cpx-bar-go").addEventListener("click", openSheet);
  $("cpx-sheet-go").addEventListener("click", () => {
    const v = $("cpx-sheet-amt").value;
    const main = $("bp-contribute-amount"), go = $("bp-contribute-btn");
    if (!main || !go) return;
    main.value = v;
    main.dispatchEvent(new Event("input", { bubbles: true }));
    sheetBusy = true;
    go.click();
  });
  let sheetBusy = false;
  // the sheet's button mirrors the main button ("Confirm in wallet…", "Confirming…")
  const mainBtn = $("bp-contribute-btn");
  if (mainBtn && "MutationObserver" in window) {
    new MutationObserver(() => {
      if (sheet.hidden) return;
      const g = $("cpx-sheet-go");
      g.textContent = mainBtn.textContent; g.disabled = mainBtn.disabled && sheetBusy;
    }).observe(mainBtn, { childList: true, characterData: true, subtree: true, attributes: true });
  }
  function paintBar() {
    const open = !!(S && S.isOpen);
    const ch = $("cpx-chips"), cp = $("cpx-chips-p");
    if (ch) ch.hidden = !open;
    if (cp) cp.hidden = !open;
    bar.hidden = !open;
    document.body.classList.toggle("cpx-has-bar", open);
    if (!open) return;
    $("cpx-bar-amt").textContent = `${fmt(toNum(S.totalRaised))} USDC`;
    const rem = _circlepadDeadline ? _circlepadDeadline - Math.floor(Date.now() / 1000) : 0;
    $("cpx-bar-time").textContent = rem > 0 ? (rem >= 86400 ? `${Math.floor(rem / 86400)}d ${Math.floor((rem % 86400) / 3600)}h` : `${Math.floor(rem / 3600)}h ${Math.floor((rem % 3600) / 60)}m`) : "";
    bar.classList.toggle("urgent", rem > 0 && rem < 3600);
  }
  setInterval(() => { if (S && S.isOpen) paintBar(); }, 30e3);

  // ================= the share card, after a contribution =================
  const card = document.createElement("div");
  card.className = "cpx-card"; card.id = "cpx-card"; card.hidden = true;
  document.body.appendChild(card);
  function memberNo(a) {
    const order = window.circlepadLbExtra && window.circlepadLbExtra.joinOrder;
    const i = order ? order.indexOf(lc(a)) : -1;
    return i >= 0 ? i + 1 : 0;
  }
  function showCard() {
    const w = me();
    if (!w || !S) return;
    const mine = toNum(S.myContribution || 0n), total = toNum(S.totalRaised);
    const share = total > 0 ? (mine / total) * 100 : 0;
    const n = memberNo(w) || (rows.findIndex((r) => lc(r.address) === w) >= 0 ? 0 : rows.length + 1);
    const text = `I'm in the CirclePad round on Arc 💚 ${fmt(mine)} USDC in${n ? `, member #${n}` : ""}. One project, one 72h USDC raise — and everyone in it votes on what it becomes.`;
    card.innerHTML = `<div class="cpx-card-bg" data-close></div>
      <div class="cpx-flip${reduce ? " flipped" : ""}" role="dialog" aria-modal="true" aria-label="${esc(tr("Your CirclePad card"))}">
        <div class="cpx-face cpx-front"><span class="cpx-orb" style="--h:${hue(w)}"></span><b>${esc(tr("Joining the circle…"))}</b></div>
        <div class="cpx-face cpx-back">
          <button type="button" class="cpx-x" data-close aria-label="${esc(tr("Close"))}">×</button>
          <span class="cpx-k">${esc(tr("CirclePad · Round #1"))}</span>
          <div class="cpx-me"><span class="cpx-av" style="--h:${hue(w)}"></span><b data-no-i18n>${esc(sh(ethers.getAddress(w)))}</b></div>
          <h3>${esc(tr("You're in the circle"))}</h3>
          <div class="cpx-nums">
            ${n ? `<div><b data-no-i18n>#${n}</b><small>${esc(tr("member"))}</small></div>` : ""}
            <div><b data-no-i18n>${fmt(mine)}</b><small>USDC</small></div>
            <div><b data-no-i18n>${share >= 10 ? share.toFixed(1) : share.toFixed(2)}%</b><small>${esc(tr("of the raise"))}</small></div>
          </div>
          <label class="cpx-inv">${esc(tr("Your invite link"))}<span><input type="text" readonly value="${esc(inviteUrl(w))}" data-no-i18n><button type="button" data-copy>${esc(tr("Copy"))}</button></span></label>
          <small class="cpx-inv-note">${esc(tr("Contributions through it are credited to you on the leaderboard."))}</small>
          <div class="cpx-acts">
            <a class="bp-btn-primary" href="https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(cardUrl(w))}&via=ARCIRCLEonArc" target="_blank" rel="noopener">${esc(tr("Share on X"))}</a>
            <a class="bp-btn-ghost" href="/api/og?round=1&w=${w}" target="_blank" rel="noopener" download="circlepad-card.png">${esc(tr("Save the image"))}</a>
          </div>
        </div>
      </div>`;
    card.hidden = false;
    requestAnimationFrame(() => { card.classList.add("in"); if (!reduce) setTimeout(() => card.querySelector(".cpx-flip").classList.add("flipped"), 650); });
  }
  function closeCard() { card.classList.remove("in"); setTimeout(() => { card.hidden = true; card.innerHTML = ""; }, 300); }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !card.hidden) closeCard(); });
  card.addEventListener("click", async (e) => {
    if (e.target.closest("[data-close]")) { closeCard(); return; }
    const c = e.target.closest("[data-copy]");
    if (c) { try { await navigator.clipboard.writeText(inviteUrl(me())); c.textContent = tr("Copied"); } catch { /* denied */ } }
  });

  // ================= opening time: countdown + calendar =================
  const opensAt = Number(CONFIG.CIRCLEPAD_OPENS_AT) || 0;
  const opens = document.createElement("div");
  opens.className = "cpx-opens"; opens.hidden = true;
  const cd = $("bp-round-countdown");
  if (cd) cd.insertAdjacentElement("afterend", opens);
  function ics(start, end, title, desc, file) {
    const d = (x) => new Date(x * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ARCIRCLE PAD//CirclePad//EN", "BEGIN:VEVENT",
      `UID:circlepad-${lc(ESCROW)}-${start}@arcircle.app`, `DTSTAMP:${d(Math.floor(Date.now() / 1000))}`, `DTSTART:${d(start)}`, `DTEND:${d(end)}`,
      `SUMMARY:${title}`, `DESCRIPTION:${desc} https://www.arcircle.app/circle`, "URL:https://www.arcircle.app/circle",
      "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", `DESCRIPTION:${title}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "text/calendar" }));
    a.download = file;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  function paintOpens() {
    const show = !!(opensAt && S && !S.started);
    opens.hidden = !show;
    if (!show) return;
    const rem = opensAt - Math.floor(Date.now() / 1000);
    const t = rem > 0 ? `${Math.floor(rem / 86400) ? Math.floor(rem / 86400) + "d " : ""}${String(Math.floor((rem % 86400) / 3600)).padStart(2, "0")}:${String(Math.floor((rem % 3600) / 60)).padStart(2, "0")}:${String(rem % 60).padStart(2, "0")}` : "";
    const html = `<span class="cpx-opens-l">${esc(tr(rem > 0 ? "Opens in" : "Opening any moment"))}</span>${t ? `<b data-no-i18n>${t}</b>` : ""}<small>${esc(when(opensAt))}</small>
      <button type="button" class="bp-notify-link" data-ics="open">${esc(tr("Add the opening to my calendar"))}</button>`;
    if (opens.__h !== html) { opens.innerHTML = html; opens.__h = html; }
  }
  opens.addEventListener("click", (e) => { if (e.target.closest("[data-ics]")) ics(opensAt, opensAt + 3600, "CirclePad raise opens", "The 72-hour CirclePad raise opens.", "circlepad-raise-opens.ics"); });
  setInterval(() => { if (!opens.hidden) paintOpens(); }, 1000);

  // ================= transparency =================
  const trust = document.createElement("section");
  trust.className = "cpx-trust"; trust.id = "cpx-trust";
  const anchor = $("cp-flowcard") || $("bp-featured");
  if (anchor) anchor.insertAdjacentElement("afterend", trust);
  const verified = CONFIG.CIRCLEPAD_ESCROW_VERIFIED === true;
  function faq() {
    const note = String(CONFIG.CIRCLEPAD_ALLOCATION_NOTE || "").trim();
    const Q = [
      ["Can I get my USDC back?", "Yes — any amount, any time until the 72 hours are up. \"Withdraw my contribution\" sends it straight back from the escrow; nobody else can move your USDC while the raise is open."],
      ["What happens when the 72 hours end?", "Contributions and withdrawals stop. Everything the escrow holds is then split in one transaction: 80% to the recipient wallet, 15% to the treasury wallet and 5% to the platform wallet — the addresses above, fixed in the contract."],
      ["Who can split it, and can it happen early?", "Only the recipient wallet can call the split, and the contract refuses it until the raise has closed."],
      ["How is the new coin shared with contributors?", note || "Not decided yet — it will be announced here before the raise opens. The list of contributors at the close is public on-chain, so anyone can check who was in and how much."],
      ["Is the contract's code public?", verified ? "Yes — the escrow's source is verified on the explorer, so what it does can be read line by line." : "The source hasn't been verified on the explorer yet. The code is in the project's repository (contracts/BigPadEscrow.sol); this note changes once it is verified."],
    ];
    return `<div class="cpx-faq"><h4>${esc(tr("After the close — questions"))}</h4>${Q.map(([q, a], i) => `<details${i === 0 ? " open" : ""}><summary>${esc(tr(q))}</summary><p>${esc(tr(a))}</p></details>`).join("")}</div>`;
  }
  function median(xs) { if (!xs.length) return 0; const s = xs.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function lorenz(xs) {
    const v = xs.filter((x) => x > 0).sort((a, b) => a - b), n = v.length, tot = v.reduce((s, x) => s + x, 0);
    if (!n || !tot) return { pts: [[0, 0], [1, 1]], gini: 0 };
    let cum = 0, area = 0, prev = 0;
    const pts = [[0, 0]];
    v.forEach((x, i) => { cum += x; const y = cum / tot; area += (prev + y) / 2 / n; prev = y; if (n <= 40 || (i + 1) % Math.ceil(n / 40) === 0 || i === n - 1) pts.push([(i + 1) / n, y]); });
    return { pts, gini: Math.max(0, Math.min(1, 1 - 2 * area)) };
  }
  function seriesFallback() {
    // no server: rebuild the hourly net from this browser's event log, block
    // times interpolated from the round's start to now
    try {
      const log = typeof circlepadLogCache === "function" ? circlepadLogCache() : null;
      if (!log || log.from == null || !_circlepadDeadline) return null;
      const t0 = _circlepadDeadline - 72 * 3600, now = Math.min(Math.floor(Date.now() / 1000), _circlepadDeadline);
      const ev = [...log.contributed.map((e) => [1, e]), ...log.refunded.map((e) => [0, e])].sort((a, b) => a[1].blockNumber - b[1].blockNumber || (a[1].index || 0) - (b[1].index || 0));
      const last = Math.max(log.scannedTo || log.from, log.from + 1);
      const spb = Math.max(0.05, (now - t0) / Math.max(1, last - log.from));
      const tsAt = (n) => t0 + (n - log.from) * spb;
      const out = []; let run = 0n, i = 0;
      for (let t = t0 + 3600; ; t += 3600) { const cut = Math.min(t, now); while (i < ev.length && tsAt(ev[i][1].blockNumber) <= cut) { run += ev[i][0] ? BigInt(ev[i][1].amount) : -BigInt(ev[i][1].amount); i++; } out.push([cut, run.toString()]); if (cut >= now || out.length > 100) break; }
      const order = []; const seen = new Set();
      for (const [k, e] of ev) { const a = lc(e.contributor); if (k && !seen.has(a)) { seen.add(a); order.push(a); } }
      window.circlepadLbExtra = { joinOrder: order, series: out, startTs: t0 };
      return out;
    } catch { return null; }
  }
  function chart(series) {
    if (!series || series.length < 1) return `<div class="cpx-chart-empty">${esc(tr("The chart starts when the raise opens."))}</div>`;
    const pts = series.map(([t, v]) => [Number(t), toNum(v)]);
    const t0 = (window.circlepadLbExtra && window.circlepadLbExtra.startTs) || pts[0][0] - 3600, t1 = t0 + 72 * 3600;
    const maxV = Math.max(1, ...pts.map((p) => p[1]));
    const X = (t) => ((t - t0) / (t1 - t0)) * 600, Y = (v) => 150 - (v / maxV) * 130;
    const d = `M0 150 L${X(t0).toFixed(1)} ${Y(0).toFixed(1)} ` + pts.map(([t, v]) => `L${X(t).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
    const lastP = pts[pts.length - 1];
    return `<svg class="cpx-chart" viewBox="0 0 600 170" preserveAspectRatio="none" role="img" aria-label="${esc(tr("Net USDC raised, hour by hour"))}">
        <defs><linearGradient id="cpxArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#39ff88" stop-opacity=".35"/><stop offset="1" stop-color="#39ff88" stop-opacity="0"/></linearGradient></defs>
        ${[0.25, 0.5, 0.75].map((k) => `<line x1="0" x2="600" y1="${(150 - k * 130).toFixed(1)}" y2="${(150 - k * 130).toFixed(1)}" class="g"/>`).join("")}
        ${[24, 48].map((hh) => `<line y1="10" y2="150" x1="${X(t0 + hh * 3600).toFixed(1)}" x2="${X(t0 + hh * 3600).toFixed(1)}" class="g"/>`).join("")}
        <path d="${d} L${X(lastP[0]).toFixed(1)} 150 Z" fill="url(#cpxArea)"/>
        <path d="${d.replace(/^M0 150 L/, "M")}" class="l" pathLength="1"/>
        <circle cx="${X(lastP[0]).toFixed(1)}" cy="${Y(lastP[1]).toFixed(1)}" r="4.5" class="dot"/>
        <text x="4" y="166">${esc(tr("Day 1"))}</text><text x="${X(t0 + 24 * 3600) + 4}" y="166">${esc(tr("Day 2"))}</text><text x="${X(t0 + 48 * 3600) + 4}" y="166">${esc(tr("Day 3"))}</text>
        <text x="596" y="22" text-anchor="end" class="v">${fmt(maxV)} USDC</text></svg>`;
  }
  function circleSvg() {
    // every contributor on up to three orbits, the biggest on the inside
    const list = rows.map((r) => ({ a: lc(r.address), v: toNum(r.amount) }));
    const total = list.reduce((s, x) => s + x.v, 0) || 1;
    const R = [70, 104, 138], cap = [12, 28, 60];
    let k = 0;
    const m = me();
    const dots = [];
    R.forEach((r, ring) => {
      const part = list.slice(k, k + cap[ring]); k += part.length;
      part.forEach((x, i) => {
        const ang = (360 / Math.max(part.length, 1)) * i + ring * 17;
        const z = Math.max(3.2, Math.min(16, 3 + Math.sqrt(x.v / total) * 30));
        dots.push(`<g class="cpx-o o${ring}" style="--a:${ang}deg"><circle class="cpx-dot${x.a === m ? " me" : ""}${seen.size && !seen.has(x.a) ? " new" : ""}" cx="150" cy="${150 - r}" r="${z.toFixed(1)}" style="--h:${hue(x.a)}" data-a="${x.a}"><title>${sh(x.a)} · ${fmt(x.v)} USDC</title></circle></g>`);
      });
    });
    list.forEach((x) => seen.add(x.a));
    const more = list.length - k;
    return `<svg class="cpx-circle" viewBox="0 0 300 300" role="img" aria-label="${esc(tr("Every contributor, as a circle"))}">
        ${R.map((r) => `<circle class="cpx-orbit" cx="150" cy="150" r="${r}"/>`).join("")}
        <g class="cpx-spin">${dots.join("")}</g>
        <text x="150" y="146" text-anchor="middle" class="n">${list.length}</text>
        <text x="150" y="166" text-anchor="middle" class="s">${esc(tr(list.length === 1 ? "member" : "members"))}</text>
        ${more > 0 ? `<text x="150" y="296" text-anchor="middle" class="s">+${more}</text>` : ""}</svg>`;
  }
  const seen = new Set();
  function paintTrust() {
    if (!trust) return;
    const extra = window.circlepadLbExtra;
    const series = (extra && extra.series) || (S && S.started ? seriesFallback() : null);
    const vals = rows.map((r) => toNum(r.amount));
    const total = vals.reduce((s, x) => s + x, 0);
    const L = lorenz(vals);
    const lp = L.pts.map(([x, y], i) => `${i ? "L" : "M"}${(x * 100).toFixed(1)} ${(100 - y * 100).toFixed(1)}`).join("");
    const bal = S ? toNum(S.balance) : 0;
    const w = wallets || {};
    const wl = (label, pct, a) => `<li><span>${esc(tr(label))}</span><b data-no-i18n>${pct}%</b>${a ? `<a href="${ex("address", a)}" target="_blank" rel="noopener" data-no-i18n>${sh(a)} ↗</a>` : `<em>—</em>`}</li>`;
    const same = w.recipient && w.platform && lc(w.recipient) === lc(w.platform);
    trust.innerHTML = `
      <div class="cpx-trust-head"><h3>${esc(tr("Transparency"))} <span class="cpx-live"><i></i>${esc(tr("Live"))}</span></h3><p>${esc(tr("Everything here is read from the chain — the escrow's balance, its payout wallets and every contribution."))}</p></div>
      <div class="cpx-trust-grid">
        <div class="cpx-tc cpx-escrow">
          <small>${esc(tr("Held by the escrow"))}</small>
          <b class="cpx-bal" data-no-i18n>${fmt(bal)} <span>USDC</span></b>
          <a href="${ex("address", ESCROW)}" target="_blank" rel="noopener" class="cpx-addr" data-no-i18n>${sh(ESCROW)} ↗</a>
          <span class="cpx-badge ${verified ? "ok" : "no"}">${esc(tr(verified ? "Source verified" : "Source not verified yet"))}</span>
          <a class="cpx-code" href="${ex("address", ESCROW)}#code" target="_blank" rel="noopener">${esc(tr("Read the contract"))} ↗</a>
        </div>
        <div class="cpx-tc cpx-wallets">
          <small>${esc(tr("At the close, in one transaction"))}</small>
          <ul>${wl("Recipient", 80, w.recipient)}${wl("Treasury", 15, w.treasury)}${wl("Platform", 5, w.platform)}</ul>
          ${same ? `<p class="cpx-same">${esc(tr("The recipient and platform wallets are the same address, so it receives 85%."))}</p>` : ""}
        </div>
        <div class="cpx-tc cpx-stats">
          <div><b data-no-i18n>${rows.length}</b><small>${esc(tr("wallets in"))}</small></div>
          <div><b data-no-i18n>${fmt(median(vals))}</b><small>${esc(tr("median USDC"))}</small></div>
          <div><b data-no-i18n>${rows.length ? fmt(total / rows.length) : 0}</b><small>${esc(tr("average USDC"))}</small></div>
          <div><b data-no-i18n>${total ? ((vals[0] || 0) / total * 100).toFixed(1) : "0"}%</b><small>${esc(tr("largest wallet"))}</small></div>
          <figure class="cpx-lorenz"><svg viewBox="-2 -2 104 104" aria-hidden="true"><path d="M0 100L100 0" class="eq"/><path d="${lp} L100 100 Z" class="a"/><path d="${lp}" class="l"/></svg>
            <figcaption><b data-no-i18n>${L.gini.toFixed(2)}</b><span>${esc(tr("Gini"))}</span><small>${esc(tr("0 = everyone put in the same, 1 = one wallet put in everything"))}</small></figcaption></figure>
        </div>
        <div class="cpx-tc cpx-chartcard">
          <small>${esc(tr("Net raised, hour by hour"))}</small>
          ${chart(series)}
        </div>
        <div class="cpx-tc cpx-circlecard">
          <small>${esc(tr("The circle"))}</small>
          ${rows.length ? circleSvg() : `<div class="cpx-chart-empty">${esc(tr(S && S.started ? "No contributors yet — be the first dot." : "Every contributor becomes a dot here once the raise opens."))}</div>`}
        </div>
        ${faq()}
      </div>`;
    // the chart line draws itself once, not on every refresh
    if (!trust.__drawn && series && series.length) { trust.__drawn = true; setTimeout(() => trust.classList.add("drawn"), 1400); }
  }
  // payout wallets, once
  (async function readWallets() {
    try {
      const c = new ethers.Contract(ESCROW, ["function recipient() view returns (address)", "function platformWallet() view returns (address)", "function treasuryWallet() view returns (address)"], readProvider());
      const [recipient, platform, treasury] = await Promise.all([c.recipient(), c.platformWallet(), c.treasuryWallet()]);
      wallets = { recipient, platform, treasury };
      paintTrust();
    } catch { /* stays "—" */ }
  })();

  // ================= live feed: who just joined =================
  const feed = document.createElement("div");
  feed.className = "cpx-feed"; feed.setAttribute("aria-live", "polite");
  document.body.appendChild(feed);
  const feedSeen = new Set();
  function feedKey(a) { return `${a.tx || ""}:${a.kind}:${lc(a.contributor)}:${a.amount}`; }
  function pushFeed(a) {
    const el = document.createElement("div");
    el.className = "cpx-fitem " + (a.kind === "out" ? "out" : "in");
    const who = sh(ethers.getAddress(a.contributor));
    el.innerHTML = `<i style="--h:${hue(a.contributor)}"></i><span>${a.kind === "out" ? esc(tr(`${who} withdrew ${fmt(toNum(a.amount))} USDC`)) : esc(tr(`${who} joined with ${fmt(toNum(a.amount))} USDC`))}</span>`;
    feed.appendChild(el);
    while (feed.children.length > 3) feed.firstChild.remove();
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 400); }, 5200);
  }
  function feedCheck() {
    const items = (activity || []).slice(0, 12);
    if (firstLb) { items.forEach((a) => feedSeen.add(feedKey(a))); return; }
    const fresh = items.filter((a) => !feedSeen.has(feedKey(a)) && lc(a.contributor) !== me()).reverse();
    items.forEach((a) => feedSeen.add(feedKey(a)));
    fresh.slice(-3).forEach((a, i) => setTimeout(() => pushFeed(a), i * 700));
  }

  // ================= leaderboard: my rank, pinned =================
  const lbPanel = $("bp-panel-leaderboard");
  const pin = document.createElement("button");
  pin.type = "button"; pin.className = "cpx-pin"; pin.id = "cpx-pin"; pin.hidden = true;
  if (lbPanel) lbPanel.appendChild(pin);
  pin.addEventListener("click", () => {
    const row = [...document.querySelectorAll("#bp-full-leaderboard .bp-lb-row")].find((r) => (r.querySelector(".bp-lb-ext") || {}).href && lc(r.querySelector(".bp-lb-ext").href).includes(me()));
    if (row) { row.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); row.classList.remove("cpx-hl"); void row.offsetWidth; row.classList.add("cpx-hl"); }
  });
  function paintPin() {
    const m = me();
    const i = m ? rows.findIndex((r) => lc(r.address) === m) : -1;
    pin.hidden = i < 0;
    document.querySelectorAll("#bp-full-leaderboard .bp-lb-row").forEach((r) => { const a = r.querySelector(".bp-lb-ext"); r.classList.toggle("cpx-mine", !!(a && m && lc(a.href).includes(m))); });
    if (i < 0) return;
    const total = rows.reduce((s, r) => s + toNum(r.amount), 0), v = toNum(rows[i].amount), n = memberNo(m);
    pin.innerHTML = `<span class="cpx-pin-k">${esc(tr("You"))}</span><b data-no-i18n>#${i + 1}</b><span data-no-i18n>${fmt(v)} USDC</span><span data-no-i18n>${total ? ((v / total) * 100).toFixed(2) : 0}%</span>${n ? `<em>${esc(tr(`member #${n}`))}</em>` : ""}<i aria-hidden="true">↓</i>`;
  }

  // ================= hooks =================
  let mineWas = { a: null, v: null };
  const origApply = applyCirclepadState;
  // eslint-disable-next-line no-global-assign
  applyCirclepadState = function (s, opts) {
    origApply(s, opts);
    if (!s) return;
    S = s;
    try {
      paintBar(); paintOpens();
      preview(($("bp-contribute-amount") || {}).value, $("cpx-chips-p"));
      if (!(opts && opts.accountUnknown)) {
        const a = me(), v = s.myContribution || 0n;
        if (a && mineWas.a === a && mineWas.v != null && v > mineWas.v) {
          if (!sheet.hidden) closeSheet();
          sheetBusy = false;
          setTimeout(showCard, reduce ? 100 : 1300);
        }
        mineWas = { a, v: a ? v : null };
      }
      paintTrust();
    } catch (e) { console.warn("circlepad-plus", e); }
  };
  const origLb = renderCirclepadLeaderboard;
  // eslint-disable-next-line no-global-assign
  renderCirclepadLeaderboard = function (r, act, flow) {
    origLb(r, act, flow);
    rows = r || []; activity = act || [];
    try { feedCheck(); paintTrust(); paintPin(); } catch (e) { console.warn("circlepad-plus", e); }
    firstLb = false;
  };
  document.addEventListener("arc:lang", () => { paintTrust(); paintPin(); paintOpens(); });
  window.circlepadPlus = { showCard, openSheet, preview: (v) => preview(v, $("cpx-chips-p")), state: () => ({ S, rows: rows.length }) };
})();
