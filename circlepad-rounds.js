/* global CONFIG, ethers, state, cpToast, cpConfirm, cpErrText, ensureArcForWrite, connectWallet, fmtEth, cpFmtTime, govLogoUrl, govDate, govFmtDate, _circlepadState, refreshCirclepadCore */
// circlepad-rounds.js — CirclePad round after round (api/_rounds.mjs):
//   · Launch process: stays under the round panel in every phase; after the close it follows the real
//     steps — the split (on-chain), then the top contributor's payout and the launch, which the round
//     wallet marks done here (signed message, optional proof link). The round wallet gets the buttons.
//   · Projects: a full summary card for every closed round (result, raise, split, launch process, vote
//     results, leaderboard, CSV) and the next round in its pre-start state, with "Start Round #N" for
//     the round wallet: it deploys a fresh BigPadEscrow (same recipient / platform / treasury wallets),
//     registers it, then calls start() — the 72-hour raise opens right then.
//   · Leaderboard: download the round's leaderboard (rank, wallet, USDC, share) as CSV.
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !document.getElementById("bp-panel-projects") || !CONFIG.CIRCLEPAD_ESCROW_ADDRESS) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const RTraw = (s, n) => { const t = tr(s); return n === 1 ? t : String(t).replace(/#1(?!\d)/g, "#" + n).replace(/第 1 轮/g, "第 " + n + " 轮"); };
  const RT = (s, n) => esc(RTraw(s, n));
  const mine = (msg) => Object.assign(new Error(msg), { mine: true });
  const errText = (e, fb) => (e && e.mine ? e.message : typeof cpErrText === "function" ? tr(cpErrText(e, fb)) : String((e && e.message) || fb));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const ex = (kind, x) => `${CONFIG.BLOCK_EXPLORER}/${kind}/${x}`;
  const usdc = (w, d = 2) => (typeof fmtEth === "function" ? fmtEth(BigInt(w || 0), d) : String(w));
  const ALT = (v, c) => (window.cpConv ? window.cpConv.html(v, c) : ""); // "≈ 0.04 ETH" under a USDC amount (circlepad-conv.js)
  const tok = (w) => Math.round(Number(BigInt(w || 0) / 10n ** 18n)).toLocaleString("en-US");
  const num = (x) => Number(x || 0).toLocaleString("en-US");
  const pct = (x) => `${Number(x || 0).toFixed(2)}%`;
  const dt = (ts) => (typeof cpFmtTime === "function" ? cpFmtTime(new Date(ts * 1000), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : new Date(ts * 1000).toLocaleString());
  const nowS = () => Math.floor(Date.now() / 1000) + (window.circlepadGovSkew || 0);
  const API = "/api/social";
  const N = () => CONFIG.CIRCLEPAD_ROUND || 1;
  const me = () => (typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : "");
  const STEPS = ["72h raise", "Burn-to-vote", "Close & split", "Top contributor", "Launch & airdrop"];
  const csvUrl = (n, u) => `${API}?circle=csv&round=${n}${u ? `&in=${u}` : ""}`;
  /// the three downloads: exact USDC, and the same with ETH or SOL columns at today's price
  const csvLinks = (n) => `<a class="bp-btn-ghost" href="${csvUrl(n)}" download>${T("Download CSV")}</a><a class="bp-btn-ghost cp-csv-alt" href="${csvUrl(n, "eth")}" download data-no-i18n>CSV · ETH</a><a class="bp-btn-ghost cp-csv-alt" href="${csvUrl(n, "sol")}" download data-no-i18n>CSV · SOL</a>`;
  window.cpRoundCards = true;

  let data = null; // ?circle=rounds
  const sums = new Map(); // n → ?circle=summary
  let busy = false;
  const team = () => !!(data && data.wallets && me() && me() === data.wallets.recipient);
  const roundOf = (n) => (data ? data.rounds.find((r) => r.n === n) : null) || null;
  const marksOf = (n) => { const r = roundOf(n); return (r && r.marks) || {}; };
  const proofLink = (p) => (!p ? "" : /^0x[0-9a-fA-F]{64}$/.test(p) ? ex("tx", p) : p);
  // after the close: 2 split next · 3 top contributor · 4 launch · 5 all done (circlepad-fx.js paints it)
  const stepFrom = (st, m) => (!st || !st.started ? -1 : nowS() < Number(st.deadline) ? 0 : !st.distributed ? 2 : !(m && m.top) ? 3 : !(m && m.launch) ? 4 : 5);
  // the launch can be marked before the top contributor's 3-day payout ends: step 5 shows done on its own
  window.cpStepDoneExtra = (i) => i === 4 && !!marksOf(N()).launch;
  window.cpStageLabel = (at) => (at === 3 && marksOf(N()).launch ? "Launched — top contributor paid over 3 days" : null);
  window.cpStepAfterClose = (s) => stepFrom({ started: true, deadline: 0, distributed: !!(s && s.distributed) }, marksOf(N()));

  // ================= data =================
  async function load(fresh) {
    try {
      const r = await fetch(`${API}?circle=rounds${fresh ? "&fresh=1" : ""}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (!j || !Array.isArray(j.rounds)) return;
      data = j;
      // this page booted on an older round (cached boot script): switch once
      const newest = j.rounds[j.rounds.length - 1];
      if (newest && newest.n > N()) {
        try {
          localStorage.setItem("circlepad.round.just-started", JSON.stringify({ n: newest.n, escrow: newest.escrow, started: !!newest.started, at: Date.now() }));
          if (sessionStorage.getItem("circlepad.round.reloaded") !== String(newest.n)) { sessionStorage.setItem("circlepad.round.reloaded", String(newest.n)); location.reload(); return; }
        } catch (e) { /* storage blocked */ }
      }
      await Promise.all(j.rounds.filter((x) => x.state && x.state.started && nowS() >= Number(x.state.deadline)).map((x) => loadSummary(x.n, fresh)));
      paintAll();
    } catch (e) { console.warn("circlepad-rounds", e); }
  }
  async function loadSummary(n, fresh) {
    const have = sums.get(n);
    if (have && !fresh && Date.now() - have.at < 60e3) return;
    try {
      const r = await fetch(`${API}?circle=summary&round=${n}`, { cache: fresh ? "no-store" : "default" });
      const j = r.ok ? await r.json() : null;
      if (j && j.n === n) sums.set(n, { at: Date.now(), v: j });
    } catch (e) { /* keep the last one */ }
  }

  // ================= Launch process (Home) =================
  function adaptSteps() {
    const tl = $("cp-timeline");
    if (!tl || N() === 1 || tl.dataset.adapted) return;
    tl.dataset.adapted = "1";
    const lis = tl.querySelectorAll(".bp-steps > li");
    const set = (i, title, body) => { const li = lis[i]; if (!li) return; const s = li.querySelector("strong"), p = li.querySelector("p"); if (s && title) s.textContent = tr(title); if (p) p.textContent = tr(body); };
    const G = CONFIG.CIRCLEPAD_ROUND_GOV || {};
    if (CONFIG.CIRCLEPAD_ROUND_PLAN && window.cpPlan) { window.cpPlan.steps(set); const nt = tl.querySelector(".cp-tl-note"); if (nt) nt.textContent = tr("The raise and the 80 / 15 / 5 split are enforced by the escrow contract. The steps after the split are the team's, marked done here by the round wallet."); return; }
    if (G.voteOn) set(1, "Pre-vote, then burn-to-vote", "Anyone suggests and pre-votes on ideas for free; the round wallet picks the candidates from the top; $ARCIRCLE holders burn-to-vote on them — 1,000 $ARCIRCLE per vote.");
    else set(1, "Burn-to-vote", "As in Round #1: ideas first, then burn-to-vote with $ARCIRCLE on name, ticker, logo, roadmap and date. Opens soon.");
    set(3, "", G.top === true ? "The largest contributor at the close receives the 15%, over 3 days." : "Whether the top contributor receives the 15% this round: not decided yet.");
    set(4, "", G.airdrop ? "The coin launches on the date the vote picks. " + G.airdrop : "The coin launches on the date the vote picks. The airdrop for this round: not decided yet.");
    const note = tl.querySelector(".cp-tl-note");
    if (note) note.textContent = tr("The raise and the 80 / 15 / 5 split are enforced by the escrow contract. The steps after the split are the team's, marked done here by the round wallet.");
  }
  // a mark: when it was done (unless it's a settled mark with no time), and its proof link
  function markText(m, what) {
    if (!m) return "";
    const link = proofLink(m.proof);
    const when = m.at ? ` · <span data-no-i18n>${esc(dt(Math.floor(m.at / 1000)))}</span>` : "";
    return `<em class="cp-tl-mark"><i></i>${m.merged ? RT("Merged into Round #1", m.merged) : T(m.exception ? "Done · this round's exception" : what)}${when}${link ? ` · <a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${T("Proof")} ↗</a>` : ""}</em>`;
  }
  function paintTimeline() {
    const tl = $("cp-timeline");
    if (!tl) return;
    adaptSteps();
    const s = typeof _circlepadState !== "undefined" ? _circlepadState : null;
    const m = marksOf(N());
    const lis = [...tl.querySelectorAll(".bp-steps > li")];
    const put = (i, html) => { const li = lis[i]; if (!li) return; let el = li.querySelector(".cp-tl-mark-w"); if (!html) { if (el) el.remove(); return; } if (!el) { el = document.createElement("span"); el.className = "cp-tl-mark-w"; (li.querySelector("div") || li).appendChild(el); } if (el.__h !== html) { el.innerHTML = html; el.__h = html; } };
    put(2, s && s.started && s.distributed ? `<em class="cp-tl-mark"><i></i>${T("Split sent from the escrow")}</em>` : "");
    put(3, markText(m.top, "Paid"));
    put(4, markText(m.launch, "Done"));
    // the round wallet's controls
    let box = $("cp-tl-admin");
    if (!team() || !s || !s.started) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("div"); box.id = "cp-tl-admin"; box.className = "cp-admin"; tl.appendChild(box); }
    const html = adminHtml(N(), { started: s.started, deadline: Number(s.deadline || 0), distributed: !!s.distributed, escrow: CONFIG.CIRCLEPAD_ESCROW_ADDRESS }, m);
    if (box.__h !== html) { box.innerHTML = html; box.__h = html; }
  }
  function adminHtml(n, st, m) {
    const at = stepFrom(st, m);
    const head = `<span class="cp-admin-k">${T("Round wallet")}</span>`;
    const proof = `<input type="text" class="cp-admin-proof" data-proof-for="${n}" placeholder="${T("Proof (optional): tx hash or https:// link")}" maxlength="200" autocomplete="off" spellcheck="false">`;
    const undo = (step, label) => `<button type="button" class="bp-btn-ghost cp-admin-undo" data-cp-stage="${n}" data-step="${step}" data-undo="1">${T(label)}</button>`;
    let body = "";
    if (at === 0) body = `<p>${T("Steps 1–2 run on their own until the raise closes.")} <span data-no-i18n>${esc(dt(st.deadline))}</span></p>`;
    else if (at === 2) body = `<p>${T("The raise has closed. Send the split to move on: 80% recipient, 15% treasury, 5% platform, in one transaction.")}</p><div class="cp-admin-row"><button type="button" class="bp-btn-primary" data-cp-split="${n}" data-escrow="${esc(st.escrow)}">${T("Send the 80 / 15 / 5 split")}</button></div>`;
    else if (at >= 3) {
      // steps 4 and 5 run side by side: the top contributor is paid over 3 days while the coin launches
      const row = (step, k, label, doneLabel) => (m && m[step]
        ? `<div class="cp-admin-row"><span class="cp-admin-done">${m[step].merged ? RT("Merged into Round #1", m[step].merged) : T(m[step].exception ? "Step " + k + " done — this round's exception" : doneLabel)}</span>${m[step].fixed ? "" : undo(step, "Undo step " + k)}</div>`
        : `<div class="cp-admin-row"><button type="button" class="bp-btn-primary" data-cp-stage="${n}" data-step="${step}">${T("Mark step " + k + " done")}</button><span class="cp-admin-what">${T(label)}</span></div>`);
      body = at === 5 ? `<p>${T("Every step is done.")}</p>` : `<p>${T("Mark each step when it's done — they can be done in either order. A proof link is optional.")}</p><div class="cp-admin-row">${proof}</div>`;
      body += row("top", 4, "Top contributor has received the 15%", "Step 4 done — top contributor paid") + row("launch", 5, "Coin launched and airdrop sent", "Step 5 done — launched");
    }
    return head + body;
  }

  // ================= Projects =================
  function projectsWrap() {
    const panel = $("bp-panel-projects");
    const wrap = panel && panel.querySelector(".bp-simple");
    if (!wrap) return null;
    let box = $("cp-rounds");
    // under the heading; circlepad-round.js puts the live round's card right above it
    if (!box) { box = document.createElement("div"); box.id = "cp-rounds"; box.className = "cp-rounds"; const h1 = wrap.querySelector("h1"); if (h1) h1.insertAdjacentElement("afterend", box); else wrap.prepend(box); }
    return { wrap, box };
  }
  function miniSteps(at, m, n) {
    return `<ol class="cp-mini-steps">${STEPS.map((s, i) => {
      const cls = at < 0 ? "" : i < at || (i === 4 && m && m.launch) ? "done" : i === at ? "now" : "";
      const label = n > 1 && i === 1 ? "Coin identity" : s;
      const mk = i === 3 && m && m.top ? m.top : i === 4 && m && m.launch ? m.launch : null;
      const link = mk ? proofLink(mk.proof) : "";
      const bits = [mk && mk.merged ? RT("Merged into Round #1", mk.merged) : mk && mk.exception ? esc(tr("This round's exception")) : mk && mk.at ? esc(dt(Math.floor(mk.at / 1000))) : "", link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(tr("Proof"))} ↗</a>` : ""].filter(Boolean);
      return `<li class="${cls}"><span class="cp-ms-n">${i + 1}</span><b>${T(label)}</b>${bits.length ? `<small data-no-i18n>${bits.join(" · ")}</small>` : ""}</li>`;
    }).join("")}</ol>`;
  }
  function badgeOf(v) {
    const at = stepFrom(v.state, v.marks);
    if (v.marks && v.marks.merged) return ["done", RTraw("Merged into Round #1", v.marks.merged.into)];
    if (at >= 3 && v.marks && v.marks.launch) return ["done", "Launched"];
    return at === 2 ? ["wait", "Settling the split"] : at === 3 ? ["ok", "Split sent"] : at === 4 ? ["ok", "Top contributor paid"] : ["ok", "Closed"];
  }
  const boardOpen = new Set();
  function summaryHtml(v) {
    const n = v.n, st = v.state, at = stepFrom(st, v.marks);
    const [bcls, blabel] = badgeOf(v);
    const b = v.ballot, win = (k) => (b && b.winners && b.winners[k] && b.winners[k].winner ? b.winners[k].winner.text : "");
    const name = win(0), ticker = String(win(1) || "").replace(/^\$/, ""), logo = win(2) && typeof govLogoUrl === "function" ? govLogoUrl(win(2)) : "", date = win(4) && typeof govDate === "function" ? govDate(win(4)) : null, road = String(win(3) || "").split("\n")[0];
    const top = v.board.top;
    const total = BigInt(st.totalRaised || 0);
    const rows = v.board.rows || [];
    const all = boardOpen.has(n);
    const shown = all ? rows : rows.slice(0, 10);
    const coin = b ? `<div class="cp-sum-coin"><span class="cp-coin-logo">${logo ? `<img src="${esc(logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : `<em data-no-i18n>${esc((name || "?").slice(0, 1).toUpperCase())}</em>`}</span>
        <div class="cp-sum-id"><small>${T("The coin the vote chose")}</small><b data-no-i18n>${esc(name || "—")}</b><span data-no-i18n>${ticker ? "$" + esc(ticker) : "—"}</span></div>
        <dl><div><dt>${T("Launch date")}</dt><dd data-no-i18n>${date && typeof govFmtDate === "function" ? esc(govFmtDate(date)) : "—"}</dd></div><div><dt>${T("Roadmap")}</dt><dd data-no-i18n>${esc(road || "—")}</dd></div></dl></div>` : "";
    const stat = (k, val, sub) => `<div><small>${T(k)}</small><b data-no-i18n>${val}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
    const stats = [
      stat("Raised", `${usdc(total, 2)} USDC${ALT(total, "cp-alt-sm")}`, v.board.flow ? `<span data-no-i18n>${usdc(v.board.flow.in, 0)}</span> ${T("in")} · <span data-no-i18n>${usdc(v.board.flow.out, 0)}</span> ${T("withdrawn")}` : ""),
      stat("Contributors", num(v.board.contributors), v.board.flow ? `<span data-no-i18n>${num(v.board.flow.wallets)}</span> ${T("wallets took part")}` : ""),
      stat("Top contributor", top ? short(top.address) : "—", top ? `<span data-no-i18n>${usdc(top.amount, 2)} USDC · ${pct(top.share)}</span>` : ""),
      b ? stat("Burned by votes", `${tok(b.burned)} $ARCIRCLE`, `<span data-no-i18n>${num(b.votes)}</span> ${T("votes")} · <span data-no-i18n>${num(b.voters)}</span> ${T("voters")}`) : "",
    ].join("");
    const split = `<div class="cp-sum-split ${st.distributed ? "ok" : "wait"}">
        <div><small>${T("Recipient")} · 80%</small><b data-no-i18n>${usdc(v.split.recipient, 2)} USDC</b>${ALT(v.split.recipient, "cp-alt-sm")}${v.wallets ? `<a href="${ex("address", v.wallets.recipient)}" target="_blank" rel="noopener" data-no-i18n>${short(v.wallets.recipient)} ↗</a>` : ""}</div>
        <div><small>${T("Treasury")} · 15%</small><b data-no-i18n>${usdc(v.split.treasury, 2)} USDC</b>${ALT(v.split.treasury, "cp-alt-sm")}${v.wallets ? `<a href="${ex("address", v.wallets.treasury)}" target="_blank" rel="noopener" data-no-i18n>${short(v.wallets.treasury)} ↗</a>` : ""}</div>
        <div><small>${T("Platform")} · 5%</small><b data-no-i18n>${usdc(v.split.platform, 2)} USDC</b>${ALT(v.split.platform, "cp-alt-sm")}${v.wallets ? `<a href="${ex("address", v.wallets.platform)}" target="_blank" rel="noopener" data-no-i18n>${short(v.wallets.platform)} ↗</a>` : ""}</div>
        <p><i></i>${T(st.distributed ? "Split sent from the escrow." : "Not sent yet — the round wallet sends it from the escrow.")}</p></div>`;
    const votes = b && b.winners ? `<details class="cp-sum-sec"><summary>${T("Vote results")}</summary><table class="cp-sum-vote"><thead><tr><th>${T("Category")}</th><th>${T("Chosen")}</th><th>${T("Votes")}</th></tr></thead><tbody>${b.winners.map((c) => {
      const w = c.winner, text = w ? (c.id === 2 ? (govLogoUrl && govLogoUrl(w.text) ? `<img src="${esc(govLogoUrl(w.text))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : esc(w.text)) : c.id === 4 && govDate(w.text) ? esc(govFmtDate(govDate(w.text))) : c.id === 3 ? esc(String(w.text).split("\n")[0]) : esc(w.text)) : "—";
      return `<tr><td>${T(c.label)}</td><td data-no-i18n>${text}</td><td data-no-i18n>${w ? `${num(w.votes)} / ${num(c.votes)}` : "0"}</td></tr>`;
    }).join("")}</tbody></table></details>` : "";
    const board = `<details class="cp-sum-sec" open><summary>${T("Leaderboard")} <span data-no-i18n>(${num(rows.length)})</span></summary>
        <ol class="cp-sum-board">${shown.map((r) => `<li><span class="cp-sb-r" data-no-i18n>#${r.rank}</span><a href="${ex("address", r.address)}" target="_blank" rel="noopener" data-no-i18n>${short(r.address)}</a><span class="cp-sb-bar"><i style="width:${Math.max(1, Math.min(100, r.share)).toFixed(2)}%"></i></span><b data-no-i18n>${usdc(r.amount, 2)}</b><em data-no-i18n>${pct(r.share)}</em></li>`).join("")}</ol>
        <div class="cp-sum-board-acts">${rows.length > 10 ? `<button type="button" class="bp-btn-ghost" data-cp-board="${n}">${T(all ? "Show the top 10" : "Show everyone")}</button>` : ""}${csvLinks(n)}</div></details>`;
    const links = [
      v.report ? `<a href="${esc(v.report)}">${T("Round report")} →</a>` : "",
      `<a href="${ex("address", v.escrow)}" target="_blank" rel="noopener">${T("Escrow contract")} ↗</a>`,
      v.contracts && v.contracts.burnvote ? `<a href="${ex("address", v.contracts.burnvote)}" target="_blank" rel="noopener">${T("Burn-vote contract")} ↗</a>` : "",
      v.deployTx ? `<a href="${ex("tx", v.deployTx)}" target="_blank" rel="noopener">${T("Deploy transaction")} ↗</a>` : "",
    ].filter(Boolean).join("");
    const admin = team() ? `<div class="cp-admin" data-admin-round="${n}">${adminHtml(n, { ...st, deadline: Number(st.deadline), escrow: v.escrow }, v.marks)}</div>` : "";
    return `<article class="cp-sum" id="cp-sum-${n}">
      <div class="cp-sum-top"><span class="cp-rc-badge ${bcls}">${T(blabel)}</span><span class="cp-sum-k">${RT("CirclePad Round #1", n)}</span><span class="cp-sum-dates" data-no-i18n>${v.startedAt ? `${esc(dt(v.startedAt))} → ${esc(dt(st.deadline))}` : ""}</span></div>
      ${coin}
      ${mergedHtml(v)}
      <div class="cp-sum-stats">${stats}</div>
      ${split}
      <div class="cp-sum-steps-w"><small class="cp-sum-h">${T("Launch process")}</small>${miniSteps(at, v.marks, n)}</div>
      ${admin}
      ${votes}
      ${board}
      <div class="cp-sum-links">${links}</div>
    </article>`;
  }
  /// a round folded into a later one: where its raise went and how its contributors are paid
  function mergedHtml(v) {
    const g = v.marks && v.marks.merged;
    if (!g) return "";
    const into = Number(g.into);
    const amt = g.usdc ? Number(g.usdc).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
    return `<div class="cp-sum-merged"><b>${RT("Merged into Round #1", into)}</b><p>${esc(RTraw("This round didn't launch on its own. Its whole raise went into Round #1, and its contributors get their share of Round #1 pro rata, from this round's list below.", into))}${amt ? ` <span data-no-i18n>(${esc(amt)} USDC)</span>` : ""}</p><button type="button" class="bp-btn-ghost" data-cp-go="governance">${RT("Go to Round #1", into)}</button></div>`;
  }
  function nextHtml(nx, pending, where) {
    const n = pending ? pending.n : nx.n;
    const can = pending ? true : nx.canOpen;
    const w = data.wallets;
    const btn = team()
      ? `<button type="button" class="bp-btn-primary" data-cp-open="${n}" ${can ? "" : "disabled"}>${RT(pending ? "Start the 72h raise" : "Prepare Round #1", n)}</button>${can ? "" : `<small class="cp-nr-wait">${RT("Round #1 closes first", n - 1)}</small>`}`
      : `<small class="cp-nr-wait">${T("Opens when the round wallet starts it.")}</small>`;
    return `<article class="cp-next-round" id="cp-next-round${where ? "-" + where : ""}">
      <div class="cp-sum-top"><span class="cp-rc-badge pre">${T(pending ? "Ready to start" : "Not started")}</span><span class="cp-sum-k">${RT("CirclePad Round #1", n)}</span></div>
      <p>${T("Same escrow as Round #1: a 72-hour USDC raise, withdraw any time before the close, and the 80 / 15 / 5 split at the close.")}</p>
      <dl class="cp-nr-facts"><div><dt>${T("Opens")}</dt><dd>${T("When the round wallet presses Start — date not decided yet")}</dd></div><div><dt>${T("Coin and vote")}</dt><dd>${T("Not decided yet")}</dd></div><div><dt>${T("Round wallet")}</dt><dd data-no-i18n>${w ? `<a href="${ex("address", w.recipient)}" target="_blank" rel="noopener">${short(w.recipient)} ↗</a>` : "—"}</dd></div>${pending ? `<div><dt>${T("Escrow")}</dt><dd data-no-i18n><a href="${ex("address", pending.escrow)}" target="_blank" rel="noopener">${short(pending.escrow)} ↗</a></dd></div>` : ""}</dl>
      ${miniSteps(-1, null, n)}
      <div class="cp-nr-acts">${btn}</div>
    </article>`;
  }
  function paintProjects() {
    const pw = projectsWrap();
    if (!pw || !data) return;
    const parts = [];
    const pending = data.rounds.find((r) => r.n > 1 && !r.started) || null;
    // this round's results first (once it has closed), then the next round, then older rounds
    const closed = [...data.rounds].reverse().map((r) => sums.get(r.n)).filter((s) => s && s.v.closed).map((s) => s.v);
    const curSum = closed.find((v) => v.n === N());
    if (curSum) parts.push(summaryHtml(curSum));
    if (pending || data.next) parts.push(nextHtml(data.next, pending));
    closed.filter((v) => v !== curSum).forEach((v) => parts.push(summaryHtml(v)));
    const html = parts.join("");
    // keep what the round wallet is typing across the 30s refresh
    const typed = {}; pw.box.querySelectorAll("[data-proof-for]").forEach((i) => { if (i.value) typed[i.dataset.proofFor] = i.value; });
    if (pw.box.__h !== html) { pw.box.innerHTML = html; pw.box.__h = html; pw.box.querySelectorAll("[data-proof-for]").forEach((i) => { if (typed[i.dataset.proofFor]) i.value = typed[i.dataset.proofFor]; }); }
    const empty = pw.wrap.querySelector(".bp-empty");
    if (empty) empty.hidden = !!html || !!$("cp-round-card");
  }

  // ================= Home: between rounds =================
  // Round #1 closed, Round #2 not prepared yet → the next round's card on Home too (the round wallet prepares it
  // there); a later round on the page → a line back to the earlier round's results.
  function paintHome() {
    const home = $("bp-panel-home"), feat = $("bp-featured");
    if (!home || !feat || !data) return;
    let box = $("cp-home-next");
    const cur = roundOf(N()), prev = N() > 1 ? roundOf(N() - 1) : null;
    const closed = cur && cur.state && cur.state.started && nowS() >= Number(cur.state.deadline);
    let html = "";
    if (closed && data.next && !data.rounds.some((r) => r.n > N())) {
      const st = cur.state;
      html = `<div class="cp-home-done"><span class="cp-rc-badge done">${T("Complete")}</span><b>${RT("CirclePad Round #1", N())}</b><span data-no-i18n>${usdc(st.totalRaised, 2)} USDC</span><button type="button" class="cp-link" data-cp-go="projects">${T("See the results")} →</button></div>` + nextHtml(data.next, null, "home");
    } else if (prev && prev.state) {
      html = `<div class="cp-home-done"><span class="cp-rc-badge done">${T("Complete")}</span><b>${RT("CirclePad Round #1", prev.n)}</b><span data-no-i18n>${usdc(prev.state.totalRaised, 2)} USDC</span><button type="button" class="cp-link" data-cp-go="projects">${T("See the results")} →</button></div>`;
    }
    if (!html) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("section"); box.id = "cp-home-next"; box.className = "cp-home-next"; feat.insertAdjacentElement("beforebegin", box); }
    if (box.__h !== html) { box.innerHTML = html; box.__h = html; }
  }

  // ================= Leaderboard: CSV =================
  function paintCsv() {
    const panel = $("bp-panel-leaderboard");
    const p = panel && panel.querySelector(".bp-simple > p");
    if (!p) return;
    let row = $("cp-lb-tools");
    if (!row) { row = document.createElement("div"); row.id = "cp-lb-tools"; row.className = "cp-lb-tools"; p.insertAdjacentElement("afterend", row); }
    const s = typeof _circlepadState !== "undefined" ? _circlepadState : null;
    const html = s && s.started ? `${csvLinks(N())}<small>${T("Rank, wallet, USDC and share of the raise — exact on-chain amounts. The ETH and SOL files add each amount at today's price (USDC counted as $1) and the price used.")}</small>` : "";
    if (row.__h !== html) { row.innerHTML = html; row.__h = html; }
    row.hidden = !html;
  }

  function paintAll() {
    try { relabel(); paintTimeline(); paintProjects(); paintHome(); paintCsv(); if (typeof window.cpRepaintStage === "function") window.cpRepaintStage(); } catch (e) { console.warn("circlepad-rounds paint", e); }
  }

  // ================= the round wallet's actions =================
  async function needTeam() {
    if (!me() && typeof connectWallet === "function") await connectWallet();
    if (!team()) { cpToast(tr("Connect the round wallet to do this."), "bad"); return false; }
    await ensureArcForWrite();
    return true;
  }
  const issuedNow = () => new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  const stageMessage = (escrow, step, undo, proof, wallet, issued) => `ARCIRCLE PAD — CirclePad launch process\nRound: ${String(escrow).toLowerCase()}\nStep: ${step}\nAction: ${undo ? "undo" : "done"}\nProof: ${proof || "-"}\nWallet: ${String(wallet).toLowerCase()}\nIssued: ${issued}`;
  async function markStage(btn) {
    const n = Number(btn.dataset.cpStage), step = btn.dataset.step, undo = btn.dataset.undo === "1";
    const r = roundOf(n);
    if (!r || busy) return;
    const input = btn.closest(".cp-admin") && btn.closest(".cp-admin").querySelector("[data-proof-for]");
    const proof = undo || !input ? "" : input.value.trim();
    if (proof && !/^0x[0-9a-fA-F]{64}$/.test(proof) && !/^https:\/\//.test(proof)) { cpToast(tr("Proof must be a transaction hash or a full https:// link."), "bad"); return; }
    const label = step === "top" ? "Step 4 — top contributor paid" : "Step 5 — launch & airdrop";
    if (!(await cpConfirm({ title: tr(undo ? "Undo this step?" : "Mark this step done?"), body: `${tr(label)}. ${tr("You sign a message with the round wallet — no transaction, no gas. Everyone sees it on the launch process.")}`, ok: tr(undo ? "Undo" : "Sign & mark done") }))) return;
    busy = true; const orig = btn.textContent; btn.disabled = true; btn.textContent = tr("Sign in wallet…");
    try {
      if (!(await needTeam())) return;
      const wallet = me(), issued = issuedNow();
      const signature = await state.signer.signMessage(stageMessage(r.escrow, step, undo, proof, wallet, issued));
      const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cstage", round: n, wallet, step, undo, proof, issued, signature }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw mine(j.error || "couldn't save it");
      cpToast(tr(undo ? "Step undone." : "Step marked done."), "ok");
      await load(true);
    } catch (e) {
      cpToast(errText(e, "That didn't go through."), "bad");
    } finally { busy = false; btn.disabled = false; btn.textContent = orig; }
  }
  async function sendSplit(btn) {
    const n = Number(btn.dataset.cpSplit), escrow = btn.dataset.escrow;
    if (busy || !escrow) return;
    if (!(await cpConfirm({ title: tr("Split the raise now?"), body: tr("The full balance goes out in one transaction: 80% to the recipient wallet, 15% to the treasury wallet and 5% to the platform wallet."), ok: tr("Split 80 / 15 / 5") }))) return;
    busy = true; const orig = btn.textContent; btn.disabled = true; btn.textContent = tr("Confirm in wallet…");
    try {
      if (!(await needTeam())) return;
      const c = new ethers.Contract(escrow, ["function withdraw()"], state.signer);
      const tx = await c.withdraw();
      btn.textContent = tr("Confirming…");
      await tx.wait();
      cpToast(tr("Split sent."), "ok");
      if (n === N() && typeof refreshCirclepadCore === "function") await refreshCirclepadCore();
      await load(true);
    } catch (e) {
      cpToast(errText(e, "Withdraw failed or was rejected."), "bad");
    } finally { busy = false; btn.disabled = false; btn.textContent = orig; }
  }
  function loadCode() {
    if (window.CP_ESCROW_CODE) return Promise.resolve(window.CP_ESCROW_CODE);
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "/circlepad-escrow-code.js?v=1";
      s.onload = () => (window.CP_ESCROW_CODE ? res(window.CP_ESCROW_CODE) : rej(mine("escrow code missing")));
      s.onerror = () => rej(mine("couldn't load the escrow code — try again"));
      document.head.appendChild(s);
    });
  }
  async function register(tx) {
    for (let k = 0; k < 8; k++) {
      const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cround", tx }) });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.round) return j.round;
      if (res.status !== 404) throw mine(j.error || "couldn't register the round");
      await new Promise((r) => setTimeout(r, 2500)); // the node hasn't seen it yet
    }
    throw mine("the deploy isn't visible yet — press Start again in a minute");
  }
  async function openRound(btn) {
    const n = Number(btn.dataset.cpOpen);
    if (busy || !data || !data.wallets) return;
    let pending = data.rounds.find((r) => r.n === n && !r.started) || null;
    // two steps: "Prepare" deploys the round's escrow (the page switches to it, before its start), "Start" opens the 72 hours
    const body = pending
      ? tr("The 72-hour raise opens right now and closes 72 hours later. This can't be undone or redone.")
      : tr("One wallet confirmation: a fresh escrow contract is deployed with the same recipient, platform and treasury wallets as Round #1. The page then shows the round before its start; the 72 hours only begin when you press Start.");
    if (!(await cpConfirm({ title: RTraw(pending ? "Start the 72h raise" : "Prepare Round #1", n) + "?", body, ok: tr(pending ? "Start" : "Prepare") }))) return;
    busy = true; const orig = btn.textContent; btn.disabled = true;
    try {
      if (!(await needTeam())) return;
      if (!pending) {
        btn.textContent = tr("Deploy — confirm in wallet…");
        const code = await loadCode();
        const w = data.wallets;
        const f = new ethers.ContractFactory(["constructor(address,address,address,uint256)"], code, state.signer);
        const c = await f.deploy(w.recipient, w.platform, w.treasury, BigInt(w.cap || 0));
        const dtx = c.deploymentTransaction();
        btn.textContent = tr("Deploying…");
        await dtx.wait();
        btn.textContent = tr("Registering…");
        pending = await register(dtx.hash);
        try { localStorage.setItem("circlepad.round.just-started", JSON.stringify({ n: pending.n, escrow: pending.escrow, started: false, at: Date.now() })); } catch (err) { /* the boot script catches up within a minute */ }
        await fetch(`${API}?circle=rounds&fresh=1`, { cache: "no-store" }).catch(() => null);
        cpToast(RTraw("Round #1 is ready — press Start when you want the 72 hours to begin.", pending.n), "ok");
        setTimeout(() => { location.hash = "home"; location.reload(); }, 900);
        return;
      }
      btn.textContent = tr("Start — confirm in wallet…");
      const e = new ethers.Contract(pending.escrow, ["function start()"], state.signer);
      const tx = await e.start();
      btn.textContent = tr("Confirming…");
      await tx.wait();
      try { localStorage.setItem("circlepad.round.just-started", JSON.stringify({ n: pending.n, escrow: pending.escrow, started: true, at: Date.now() })); } catch (err) { /* the boot script catches up within a minute */ }
      await fetch(`${API}?circle=rounds&fresh=1`, { cache: "no-store" }).catch(() => null);
      cpToast(RTraw("Round #1 is open.", pending.n), "ok");
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      cpToast(errText(e, "That didn't go through."), "bad");
      await load(true);
    } finally { busy = false; btn.disabled = false; btn.textContent = orig; }
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-cp-stage]"); if (a) { markStage(a); return; }
    const s = e.target.closest("[data-cp-split]"); if (s) { sendSplit(s); return; }
    const o = e.target.closest("[data-cp-open]"); if (o) { openRound(o); return; }
    const b = e.target.closest("[data-cp-board]");
    if (b) { const n = Number(b.dataset.cpBoard); if (boardOpen.has(n)) boardOpen.delete(n); else boardOpen.add(n); paintProjects(); }
  });

  // Later rounds: this round's number on the page, and Governance says plainly that its vote isn't set up
  function relabel() {
    if (N() === 1) return;
    const note = $("bp-gov-panel-note"), G = CONFIG.CIRCLEPAD_ROUND_GOV || {};
    if (CONFIG.CIRCLEPAD_ROUND_PLAN && window.cpPlan) window.cpPlan.copy();
    else if (note && !G.voteOn) note.textContent = tr("Governance for this round opens soon, as in Round #1: first the community's ideas, then burn-to-vote with $ARCIRCLE until the raise closes. Round #1's result is on Projects.");
    const h2 = document.querySelector("#bp-featured .bp-featured-info h2");
    if (h2 && h2.firstChild && h2.firstChild.nodeType === 3) { h2.setAttribute("data-no-i18n", ""); h2.firstChild.textContent = RTraw("CirclePad Round #1", N()) + " "; }
    const tag = document.querySelector(".cp-tl-tag");
    if (tag) tag.textContent = RTraw("Round #1", N());
  }

  ["circlepad:state", "circlepad:lb", "arc:lang"].forEach((ev) => document.addEventListener(ev, paintAll));
  load(false);
  setInterval(() => { if (!document.hidden) load(false); }, 30e3);
  // the close happens on the clock: pick up the summary without waiting a full cycle
  setInterval(() => { const r = roundOf(N()); if (r && r.state && r.state.started && nowS() >= Number(r.state.deadline) && !sums.has(N())) load(true); }, 10e3);
})();
