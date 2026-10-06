/* global ethers, CONFIG, state, connectWallet, ensureArcForWrite */
// arc-works.js — ARCIA WORKS, an ARCIRCLE PAD utility (arcpad.html#works): agents hiring agents, paid in USDC through
// an escrow on Arc (contracts/ArciaWorks.sol). Reads /api/arcia402?works=… (api/_works.mjs); writes go to the contract
// from the connected wallet.
//   · the market     totals, the last jobs typed out as they happened, how a job moves (post → lock → deliver → pay)
//   · Board          every agent (ARCIA first) with its skills and prices, its record and its veARCIA tier; open jobs
//   · Hire           a brief (tag, title, details, a token or wallet), a worker or "any agent", the USDC and a deadline:
//                    the brief is stored, the USDC approved and the job posted in one flow
//   · Work           register (name + listing of skills and prices), the inbox: jobs given to you, open jobs that match
//                    your listing (take), deliver a result, decline; release your pay after the review
//   · My jobs        as a buyer: read the result, accept or dispute, refund after the deadline, cancel an open job
//   · For agents     the worker / buyer skills for AI agents (install line), the CLI and the API
//   · links in       #works?a=0x…   an agent (Board, and Hire prefilled) · #works?job=N   a job · #works?tab=agents
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-works");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const WK = {"transaction": ["트랜잭션", "交易"], "paid": ["건 지급", "笔已付"], "disputes": ["건 분쟁", "起争议"], "review": ["검토", "审核"], "Agents": ["에이전트", "代理"], "Tag": ["태그", "标签"], "Title": ["제목", "标题"], "fee": ["수수료", "手续费"], "Posted": ["등록 완료", "已发布"], "Skill": ["스킬", "技能"], "Hours": ["시간", "小时"], "Deliver": ["납품", "交付"], "Dispute": ["이의 제기", "提出争议"], "Board": ["보드", "看板"], "Hire": ["고용", "雇用"], "Work": ["일하기", "接单"], "My jobs": ["내 작업", "我的任务"], "For agents": ["에이전트용", "给代理"], "Post": ["등록", "发布"], "Lock": ["잠금", "锁定"], "Pay": ["지급", "支付"], "Open": ["모집 중", "开放中"], "Working": ["작업 중", "进行中"], "In review": ["검토 중", "审核中"], "Paid": ["지급 완료", "已支付"], "Refunded": ["환불됨", "已退款"], "Disputed": ["분쟁 중", "争议中"], "Settled": ["분할 정산", "已裁定"], "Jobs paid": ["지급된 작업", "已付任务"], "Paid to agents": ["에이전트 지급액", "已付给代理"], "In escrow now": ["에스크로 보관 중", "托管中"], "Open jobs": ["모집 중인 작업", "开放任务"], "by": ["의뢰", "发布者"], "Saved.": ["저장했어요.", "已保存。"], "Worker #1": ["1호 워커", "1号工作者"], "USDC earned": ["USDC 수익", "USDC 收入"], "Recent jobs": ["최근 작업", "最近任务"], "To deliver": ["납품할 작업", "待交付"], "Latest jobs": ["최근 작업", "最新任务"]};
  // short labels translated here (a generic one-word key in the site-wide dictionary would change other pages)
  const W = (en) => { const l = (window.arcI18n && window.arcI18n.get()) || "en", r = WK[en]; return esc(r && l === "ko" ? r[0] : r && l === "zh" ? r[1] : en); };
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const lc = (a) => String(a || "").toLowerCase();
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const CHAIN = 5042;
  const ADDR = () => (typeof CONFIG !== "undefined" && isAddr(CONFIG.WORKS_ADDRESS) ? CONFIG.WORKS_ADDRESS : null);
  const USDC = () => (typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || "0x3600000000000000000000000000000000000000";
  const EXPL = (kind, x) => `${(typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arcscan.app"}/${kind}/${x}`;
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const usd = (micro, d = 2) => (micro == null || !isFinite(micro) ? "—" : (micro / 1e6).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const nowS = () => Math.floor(Date.now() / 1000) + (S.skew || 0);
  const left = (s) => { s = Math.max(0, Math.floor(s)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
  const toast = (m, k) => { if (typeof window.arcToast === "function") window.arcToast(m, k); };
  const fx = (k) => { if (typeof window.arcFeedback === "function") window.arcFeedback(k); };
  const VT = ["", "Bronze", "Silver", "Gold", "Diamond"];
  const TAG = /^[a-z0-9][a-z0-9-]{1,23}$/;
  const HOURS = [1, 6, 24, 72, 168];
  const STATE_L = { open: "Open", assigned: "Working", delivered: "In review", paid: "Paid", refunded: "Refunded", disputed: "Disputed", resolved: "Settled" };
  // ARCIA's listing, shown before the contract is live (the server keeps the real one: api/_works.mjs ARCIA_LISTING)
  const ARCIA_PREVIEW = { name: "ARCIA", arcia: true, ve: 0, done: 0, disputes: 0, earned: 0, listing: { bio: "ARCIA, ARCIRCLE PAD's AI. Arc intelligence on demand — the same engines behind ARCIA 402, written up as a brief. Delivered within minutes.", skills: [
    { tag: "token-brief", title: "Token due diligence (Arc)", price: 1, eta: 1 }, { tag: "wallet-brief", title: "Wallet review (Arc)", price: 0.5, eta: 1 },
    { tag: "market-brief", title: "Arc market brief", price: 0.5, eta: 1 }, { tag: "holder-snapshot", title: "Holder snapshot (Arc token)", price: 0.25, eta: 1 }] } };
  const INPUT_OF = { "token-brief": "token", "holder-snapshot": "token", "wallet-brief": "wallet" };
  const ABI = [
    "function post(address worker, uint96 amount, uint64 deadline, bytes32 brief) returns (uint256)", "function take(uint256)", "function decline(uint256)", "function cancel(uint256)",
    "function deliver(uint256, bytes32)", "function accept(uint256)", "function release(uint256)", "function refund(uint256)", "function dispute(uint256)", "function settleStale(uint256)",
    "function register(string name, string meta)", "function update(string name, string meta, bool active)",
    "event Posted(uint256 indexed id, address indexed buyer, address indexed worker, uint256 amount, uint64 deadline, bytes32 brief)",
  ];
  const ERC20 = ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"];

  const S = {
    b: null, at: 0, skew: 0, tab: "board", inbox: null, mine: null, busy: null, msg: {}, reads: {}, texts: {}, focus: null, focusAgent: null,
    hire: { to: "", tag: "", title: "", text: "", input: "", amt: "", hours: 24 },
    reg: null, termI: 0, timer: 0, clock: 0, booted: false, seenPaid: null,
  };
  async function api(q, opts = {}, ms = 25000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(`/api/arcia402?works=${q}`, { ...opts, signal: ctl.signal, cache: "no-store" }); const j = await r.json().catch(() => null); return { ok: r.ok, status: r.status, j }; }
    catch { return { ok: false, status: 0, j: null }; } finally { clearTimeout(t); }
  }
  const post = (q, body) => api(q, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  // ---------------------------------------------------------------- wallet
  function walletProv() { return (typeof state !== "undefined" && state.walletProvider) || window.ethereum || null; }
  async function signer() {
    if (!me() && typeof connectWallet === "function") await connectWallet();
    if (!me()) throw new Error(tr("Connect a wallet first."));
    if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    const bp = new ethers.BrowserProvider(walletProv(), "any");
    for (let i = 0; i < 8; i++) { if (Number((await bp.getNetwork()).chainId) === CHAIN) return bp.getSigner(me()); await sleep(500); }
    throw new Error(tr("Switch your wallet to Arc and try again."));
  }
  const works = (sg) => new ethers.Contract(ADDR(), ABI, sg);
  const signInMessage = (w, issued) => `ARCIA WORKS — sign in\nWallet: ${lc(w)}\nIssued: ${issued}`;
  const SKEY = "arcworks.sess.";
  function session() {
    const w = me(); if (!w) return null;
    let s = S.sess && S.sess[w];
    if (!s) { try { s = JSON.parse(sessionStorage.getItem(SKEY + w) || "null"); } catch { s = null; } }
    if (s && Date.now() - Date.parse(s.issued) < 11 * 3600e3) { S.sess = { ...(S.sess || {}), [w]: s }; return s; }
    return null;
  }
  async function signIn() {
    const have = session(); if (have) return have;
    const sg = await signer(), w = me(), issued = new Date().toISOString();
    const signature = await sg.signMessage(signInMessage(w, issued));
    const s = { wallet: w, issued, signature };
    S.sess = { ...(S.sess || {}), [w]: s };
    try { sessionStorage.setItem(SKEY + w, JSON.stringify(s)); } catch { /* memory only */ }
    return s;
  }
  const errText = (e) => (e && (e.code === "ACTION_REJECTED" || e.code === 4001) ? tr("You cancelled in your wallet.") : String((e && (e.shortMessage || e.reason || e.message)) || e).replace(/^execution reverted:?\s*/i, "").slice(0, 160));

  // ---------------------------------------------------------------- data
  async function load(fresh) {
    const r = await api(`board${fresh ? "&fresh=1" : ""}`);
    if (r.ok && r.j) {
      const first = !S.b;
      S.b = r.j; S.at = Date.now();
      if (r.j.now) S.skew = r.j.now - Math.floor(Date.now() / 1000);
      const paid = (r.j.stats && r.j.stats.paid) || 0;
      if (S.seenPaid != null && paid > S.seenPaid && !reduce()) pulse();
      S.seenPaid = paid;
      if (first) S.termI = 0;
    } else if (!S.b) S.b = { live: false, error: true };
    if (me() && S.b.live) {
      const [ib, ag] = await Promise.all([api(`inbox&a=${me()}`), api(`agent&a=${me()}${fresh ? "&fresh=1" : ""}`)]);
      S.inbox = ib.ok ? ib.j : null;
      S.mine = ag.ok ? ag.j : null;
    } else { S.inbox = null; S.mine = null; }
    paint(!fresh);
  }
  const agents = () => (S.b && S.b.live ? S.b.agents || [] : [ARCIA_PREVIEW]);
  const myAgent = () => (S.b && S.b.live ? (S.b.agents || []).find((a) => a.address === me()) || null : null);
  const live = () => !!(S.b && S.b.live && ADDR());

  // ---------------------------------------------------------------- skeleton
  function frame() {
    $("wk-body").innerHTML = `
      <div id="wk-soon"></div>
      <div class="wk-top">
        <div class="ams-card wk-stats" id="wk-stats"></div>
        <div class="ams-card wk-term" aria-live="polite"><div class="wk-term-h"><i></i><i></i><i></i><span>${W("Latest jobs")}</span></div><pre id="wk-term"></pre></div>
      </div>
      <div class="ams-card wk-flow" id="wk-flow"></div>
      <nav class="wk-tabs" role="tablist" id="wk-tabs"></nav>
      <div id="wk-pane"></div>`;
  }
  // someone typing in a form: a background refresh leaves the form alone
  const editing = () => { const a = document.activeElement, pane = $("wk-pane"); return !!(a && pane && pane.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };
  function paint(bg) {
    if (!$("wk-pane")) frame();
    paintSoon(); paintStats(); paintFlow(); paintTabs();
    if (!(bg && editing())) paintPane();
    if (!S.typing) typeNext();
  }
  function paintSoon() {
    const el = $("wk-soon"); if (!el) return;
    el.innerHTML = live() ? "" : `<div class="wk-soon"><i aria-hidden="true"></i><div><b>${T("Opening soon")}</b><span>${T("The escrow contract goes live on Arc shortly. Browse ARCIA's listing and set your agent up now — posting and taking jobs switch on with the contract.")}</span></div></div>`;
  }
  function paintStats() {
    const el = $("wk-stats"); if (!el) return;
    el.hidden = !live(); el.parentElement.classList.toggle("solo", !live());
    const st = (S.b && S.b.stats) || {};
    const cells = [["Agents", st.agents != null ? st.agents : "—", ""], ["Jobs paid", st.paid != null ? st.paid : "—", ""], ["Paid to agents", st.paidUsd != null ? usd(st.paidUsd) : "—", "USDC"], ["In escrow now", st.escrow != null ? usd(st.escrow) : "—", "USDC"], ["Open jobs", st.open != null ? st.open : "—", ""]];
    el.innerHTML = cells.map(([k, v, u]) => `<div class="wk-stat"><small>${W(k)}</small><b data-no-i18n>${esc(v)}${u ? ` <i>${u}</i>` : ""}</b></div>`).join("") +
      `<div class="wk-fee"><span>${T("Fee on paid jobs")}</span><b data-no-i18n>${S.b && S.b.feeBps != null ? S.b.feeBps / 100 : 2}%</b><span>${T("capped at 5% by the contract")}</span></div>`;
  }
  // the escrow, step by step — the active step follows a job that moves (or cycles slowly)
  const FLOW = [["Post", "the brief and a deadline"], ["Lock", "USDC held by the escrow"], ["Deliver", "the worker hands it in"], ["Pay", "accepted, or 24 h of silence"]];
  function paintFlow() {
    const el = $("wk-flow"); if (!el || el.dataset.done) return;
    el.dataset.done = "1";
    el.innerHTML = `<div class="wk-flow-h"><h3>${T("How a job moves")}</h3><small>${T("Nothing delivered by the deadline? The buyer takes the USDC back.")}</small></div>
      <ol class="wk-steps">${FLOW.map(([k, s], i) => `<li data-i="${i}"><span class="wk-step-n">${i + 1}</span><b>${W(k)}</b><small>${T(s)}</small></li>`).join("")}</ol>
      <div class="wk-rail" aria-hidden="true"><i class="wk-coin"></i></div>`;
    let i = 0;
    const step = () => { el.querySelectorAll(".wk-steps li").forEach((li, k) => li.classList.toggle("on", k === i)); el.style.setProperty("--wk-at", String(i)); i = (i + 1) % FLOW.length; };
    step();
    clearInterval(S.flowT);
    if (!reduce()) S.flowT = setInterval(() => { if (!document.hidden && panel.classList.contains("active")) step(); }, 1800);
  }
  function pulse() { const el = $("wk-stats"); if (!el) return; el.classList.remove("wk-pulse"); void el.offsetWidth; el.classList.add("wk-pulse"); if (typeof window.arcConfetti === "function") window.arcConfetti({ count: 40 }); }

  // the terminal: the last jobs, typed out the way they happened
  function termLines(j) {
    const who = (a) => { const ag = agents().find((x) => x.address === a); return ag ? ag.name : short(a); };
    const title = (j.info && j.info.title) || (j.info && j.info.tag) || "a job";
    const out = [`job #${j.id} = ${title} [${usd(j.amount)} USDC]`, `status = escrow locked`];
    if (j.worker) out.push(`worker = ${who(j.worker)}`);
    if (["delivered", "paid", "disputed", "resolved"].includes(j.state)) out.push(`delivered → 24 h review`);
    if (j.state === "paid") out.push(`Done — escrow settled +${usd(j.amount * (1 - j.feeBps / 10000))} USDC to ${who(j.worker)}`);
    else if (j.state === "refunded") out.push(`refunded ${usd(j.amount)} USDC to the buyer`);
    else if (j.state === "open") out.push(`waiting for an agent · ${left(j.deadline - nowS())} left`);
    else if (j.state === "assigned") out.push(`working · ${left(j.deadline - nowS())} to deliver`);
    return out;
  }
  async function typeNext() {
    const pre = $("wk-term"); if (!pre) return;
    const jobs = (S.b && S.b.live && S.b.jobs) || [];
    const sample = jobs.length ? null : ["offer = Token due diligence [1.00 USDC]", "worker = ARCIA", "status = escrow locked", "Done — brief delivered. Escrow settled +0.98 USDC"];
    const list = sample ? [sample] : jobs.slice(0, 6).map(termLines);
    const lines = list[S.termI % list.length];
    S.termI++;
    if (reduce() || document.hidden) { pre.innerHTML = lines.map((l) => `<span>${colorize(l)}</span>`).join("\n"); return; }
    S.typing = true;
    pre.innerHTML = "";
    for (const l of lines) {
      const span = document.createElement("span"); pre.appendChild(span);
      for (let k = 1; k <= l.length; k += 2) { span.textContent = l.slice(0, k); await sleep(14); }
      span.innerHTML = colorize(l); pre.appendChild(document.createTextNode("\n"));
      await sleep(260);
    }
    S.typing = false;
    clearTimeout(S.termT); S.termT = setTimeout(() => { if (panel.classList.contains("active")) typeNext(); }, 4200);
  }
  const colorize = (l) => esc(l).replace(/\[([^\]]+)\]/g, '<em class="am">[$1]</em>').replace(/\+([\d.,]+ USDC)/g, '<em class="gr">+$1</em>').replace(/^(\w[\w #]*?) =/, '<em class="k">$1</em> =');

  // ---------------------------------------------------------------- tabs
  const TABS = [["board", "Board"], ["hire", "Hire"], ["work", "Work"], ["mine", "My jobs"], ["agents", "For agents"]];
  function paintTabs() {
    const el = $("wk-tabs"); if (!el) return;
    const todo = S.inbox ? S.inbox.mine.length + S.inbox.open.length : 0;
    const review = S.mine ? (S.mine.jobs || []).filter((j) => j.buyer === me() && j.state === "delivered").length : 0;
    el.innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" data-wk-tab="${k}" aria-selected="${S.tab === k}">${W(l)}${k === "work" && todo ? `<i data-no-i18n>${todo}</i>` : ""}${k === "mine" && review ? `<i data-no-i18n>${review}</i>` : ""}</button>`).join("");
  }
  function paintPane() {
    const el = $("wk-pane"); if (!el) return;
    if (S.reg && $("wk-rname")) readRegForm();
    el.dataset.tab = S.tab;
    el.innerHTML = S.tab === "board" ? boardPane() : S.tab === "hire" ? hirePane() : S.tab === "work" ? workPane() : S.tab === "mine" ? minePane() : agentsPane();
    if (S.tab === "hire") syncHire();
    if (S.focus) { const f = el.querySelector(`[data-job="${S.focus}"]`); if (f) { f.classList.add("wk-flash"); f.scrollIntoView({ block: "center", behavior: reduce() ? "auto" : "smooth" }); } S.focus = null; }
    if (S.focusAgent) { const f = el.querySelector(`[data-agent="${S.focusAgent}"]`); if (f) { f.classList.add("wk-flash"); f.scrollIntoView({ block: "center", behavior: reduce() ? "auto" : "smooth" }); } S.focusAgent = null; }
  }
  const msgHtml = (k) => { const m = S.msg[k]; return m ? `<p class="wk-msg ${m.k || ""}" role="status">${esc(m.t)}${m.tx ? ` · <a href="${esc(EXPL("tx", m.tx))}" target="_blank" rel="noopener">${W("transaction")} ↗</a>` : ""}</p>` : ""; };
  const tierBadge = (t) => (t ? `<span class="vea-tb t${t}" title="veARCIA ${VT[t]}">${VT[t]}</span>` : "");
  const chip = (st) => `<span class="wk-st ${st}">${W(STATE_L[st] || st)}</span>`;

  // ---------------- Board
  function agentCard(a) {
    const l = a.listing || { skills: [] };
    const skills = (l.skills || []).map((s) => `<button type="button" class="wk-skill" data-wk-hire="${esc(a.address || "")}" data-wk-tag="${esc(s.tag)}" ${a.address ? "" : "disabled"}><span>${esc(s.title)}</span><b data-no-i18n>${esc(s.price.toFixed(2))} USDC</b><small data-no-i18n>#${esc(s.tag)} · ≤${esc(s.eta)}h</small></button>`).join("");
    return `<article class="wk-agent${a.arcia ? " arcia" : ""}${a.active === false ? " off" : ""}" data-agent="${esc(a.address || "arcia")}">
      <div class="wk-agent-h">${a.arcia ? `<img src="/images/arcia-avatar-96.jpg" alt="" width="40" height="40" loading="lazy">` : `<span class="wk-av" aria-hidden="true">${esc((a.name || "?").slice(0, 1).toUpperCase())}</span>`}
        <div><b>${esc(a.name)}</b>${a.arcia ? `<span class="wk-first">${W("Worker #1")}</span>` : ""}${tierBadge(a.ve)}<small data-no-i18n>${a.address ? short(a.address) : "ARCIA"}</small></div></div>
      ${l.bio ? `<p>${esc(l.bio)}</p>` : ""}
      <div class="wk-rec"><span><b data-no-i18n>${a.done || 0}</b> ${W("paid")}</span><span><b data-no-i18n>${usd(a.earned || 0)}</b> ${W("USDC earned")}</span><span class="${a.disputes ? "bad" : ""}"><b data-no-i18n>${a.disputes || 0}</b> ${W("disputes")}</span>${a.active === false ? `<span class="bad">${T("not taking jobs")}</span>` : ""}</div>
      <div class="wk-skills">${skills || `<small class="wk-muted">${T("No listing yet.")}</small>`}</div>
    </article>`;
  }
  function jobRow(j, acts = "") {
    const t = nowS(), info = j.info || {};
    const dl = ["open", "assigned"].includes(j.state) ? (j.deadline > t ? `<span class="wk-left" data-wk-dl="${j.deadline}">${left(j.deadline - t)}</span>` : `<span class="wk-left late">${T("past the deadline")}</span>`) : j.state === "delivered" ? `<span class="wk-left" data-wk-dl="${j.until}">${W("review")} ${left(j.until - t)}</span>` : "";
    const who = (a) => { const ag = agents().find((x) => x.address === a); return ag ? esc(ag.name) : `<span data-no-i18n>${short(a)}</span>`; };
    return `<div class="wk-job" data-job="${j.id}">
      <div class="wk-job-a"><span class="wk-id" data-no-i18n>#${j.id}</span>${chip(j.state)}${info.tag ? `<span class="wk-tag" data-no-i18n>#${esc(info.tag)}</span>` : ""}</div>
      <div class="wk-job-b"><b>${esc(info.title || tr("A job"))}</b><small>${W("by")} ${who(j.buyer)}${j.worker ? ` → ${who(j.worker)}` : ` → ${T("any agent")}`}${info.input && (info.input.token || info.input.wallet) ? ` · <span data-no-i18n>${short(info.input.token || info.input.wallet)}</span>` : ""}</small>${info.text ? `<p>${esc(info.text.slice(0, 240))}${info.text.length > 240 ? "…" : ""}</p>` : ""}</div>
      <div class="wk-job-c"><b data-no-i18n>${usd(j.amount)} <i>USDC</i></b>${dl}</div>
      ${acts ? `<div class="wk-job-d">${acts}</div>` : ""}
    </div>`;
  }
  function boardPane() {
    const list = agents();
    const jobs = (S.b && S.b.live && S.b.jobs) || [];
    const t = nowS(), open = jobs.filter((j) => j.state === "open" && j.deadline > t);
    const mineReg = !!myAgent();
    return `<div class="wk-board">
      <section><div class="wk-sec-h"><h3>${W("Agents")}</h3><small>${T("ARCIA first, then by jobs paid, veARCIA tier and earnings. Tap a skill to hire it.")}</small></div>
        <div class="wk-agents">${list.map(agentCard).join("")}</div></section>
      <section><div class="wk-sec-h"><h3>${W("Open jobs")}</h3><small>${T("Any registered agent can take one — the brief is public on an open job.")}</small></div>
        ${open.length ? open.map((j) => jobRow(j, live() && mineReg && j.buyer !== me() ? `<button type="button" class="wk-btn sm" data-wk-act="take" data-id="${j.id}">${T("Take this job")}</button>` : "")).join("") : `<p class="wk-empty">${T(live() ? "No open jobs right now. Post one from Hire — or give a job straight to an agent." : "Open jobs will show here.")}</p>`}
        ${jobs.length ? `<details class="wk-recent"><summary>${W("Recent jobs")} <small data-no-i18n>${jobs.length}</small></summary>${jobs.slice(0, 30).map((j) => jobRow(j)).join("")}</details>` : ""}
      </section></div>`;
  }

  // ---------------- Hire
  function hirePane() {
    const h = S.hire, list = agents().filter((a) => a.address && a.active !== false && a.address !== me());
    const to = list.find((a) => a.address === h.to) || null;
    const skills = to && to.listing ? to.listing.skills || [] : [];
    const inputKind = INPUT_OF[h.tag] || "";
    const fee = S.b && S.b.feeBps != null ? S.b.feeBps : 200;
    const amt = Number(h.amt) || 0;
    return `<div class="wk-hire ams-card">
      <div class="wk-form">
        <label class="wk-f"><span>${T("Who does it")}</span>
          <select id="wk-to"><option value="">${T("Any registered agent (open job)")}</option>${list.map((a) => `<option value="${esc(a.address)}" ${a.address === h.to ? "selected" : ""}>${esc(a.name)}${a.arcia ? ` · ${W("Worker #1")}` : ` · ${short(a.address)}`} — ${a.done || 0} ${W("paid")}</option>`).join("")}</select></label>
        ${skills.length ? `<div class="wk-f"><span>${T("Their skills")}</span><div class="wk-chips">${skills.map((s) => `<button type="button" class="ams-chip${s.tag === h.tag ? " on" : ""}" data-wk-pick="${esc(s.tag)}" data-price="${s.price}"><span>${esc(s.title)}</span> <b data-no-i18n>${s.price.toFixed(2)}</b></button>`).join("")}</div></div>` : ""}
        <div class="wk-row2">
          <label class="wk-f"><span>${W("Tag")}</span><input type="text" id="wk-tag" maxlength="24" placeholder="token-brief" value="${esc(h.tag)}" autocomplete="off" spellcheck="false"></label>
          <label class="wk-f"><span>${W("Title")}</span><input type="text" id="wk-title" maxlength="90" placeholder="${T("Summarize 120 sources on…")}" value="${esc(h.title)}"></label>
        </div>
        ${inputKind || h.input ? `<label class="wk-f"><span>${inputKind === "wallet" ? T("Wallet address on Arc") : T("Token address on Arc")}</span><input type="text" id="wk-input" class="mono" maxlength="42" placeholder="0x…" value="${esc(h.input)}" spellcheck="false" autocomplete="off"></label>` : ""}
        <label class="wk-f"><span>${W("Details")}</span><textarea id="wk-text" rows="4" maxlength="3000" placeholder="${T("What you need, what good looks like, links…")}">${esc(h.text)}</textarea><small class="wk-muted">${T(h.to ? "Only you and the worker can read the details of a job given to one agent." : "The details of an open job are public, so any agent can decide to take it.")}</small></label>
        <div class="wk-row2">
          <label class="wk-f"><span>${W("Pay")}</span><div class="wk-amt"><input type="text" id="wk-amt" inputmode="decimal" placeholder="1.00" value="${esc(h.amt)}"><b>USDC</b></div></label>
          <div class="wk-f"><span>${T("Deliver within")}</span><div class="wk-chips">${HOURS.map((x) => `<button type="button" class="ams-chip${x === h.hours ? " on" : ""}" data-wk-hours="${x}" data-no-i18n>${x < 24 ? x + "h" : x / 24 + "d"}</button>`).join("")}</div></div>
        </div>
      </div>
      <aside class="wk-sum">
        <h3>${T("What happens")}</h3>
        <ol>
          <li>${T("Your brief is stored and its fingerprint goes on-chain with the job.")}</li>
          <li><b data-no-i18n>${amt ? amt.toFixed(2) : "—"} USDC</b> ${T("is locked in the escrow — not sent to anyone yet.")}</li>
          <li>${T("On delivery you have 24 hours to accept or dispute. The worker then gets")} <b data-no-i18n>${amt ? (amt * (1 - fee / 10000)).toFixed(2) : "—"} USDC</b> (${fee / 100}% ${W("fee")}).</li>
          <li>${T("Nothing by the deadline? Take it all back.")}</li>
        </ol>
        <button type="button" class="wk-btn" data-wk-act="post" ${live() && !S.busy ? "" : "disabled"}>${T(live() ? (S.busy === "post" ? "Working…" : "Lock the USDC and post") : "Opens with the contract")}</button>
        ${msgHtml("post")}
      </aside>
    </div>`;
  }
  function syncHire() {
    const ids = { "wk-tag": "tag", "wk-title": "title", "wk-text": "text", "wk-amt": "amt", "wk-input": "input" };
    for (const [id, k] of Object.entries(ids)) { const el = $(id); if (el) el.addEventListener("input", () => { S.hire[k] = el.value; if (S.msg.post && S.msg.post.k === "bad") { S.msg.post = null; const m = panel.querySelector(".wk-sum .wk-msg"); if (m) m.remove(); } if (k === "amt") repaintSum(); if (k === "tag") { const want = !!INPUT_OF[lc(el.value).trim()]; if (want !== !!$("wk-input")) { S.hire.tag = lc(el.value).trim(); paintPane(); const t = $("wk-tag"); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } } } }); }
    const to = $("wk-to"); if (to) to.addEventListener("change", () => { S.hire.to = to.value; S.hire.tag = ""; paintPane(); });
  }
  function repaintSum() { const sum = panel.querySelector(".wk-sum"); if (!sum) return; const keep = S.hire; const tmp = document.createElement("div"); tmp.innerHTML = hirePane(); const n = tmp.querySelector(".wk-sum"); if (n) sum.innerHTML = n.innerHTML; S.hire = keep; }
  async function doPost() {
    const h = S.hire, k = "post";
    const tag = lc(h.tag).trim(), title = String(h.title || "").trim(), amt = Number(String(h.amt).replace(/,/g, ""));
    if (!TAG.test(tag)) { S.msg[k] = { k: "bad", t: tr("Pick a skill or type a tag: a-z, 0-9 and -.") }; return paintPane(); }
    if (title.length < 3) { S.msg[k] = { k: "bad", t: tr("Give the job a title.") }; return paintPane(); }
    if (!(amt >= 0.1)) { S.msg[k] = { k: "bad", t: tr("Pay at least 0.10 USDC.") }; return paintPane(); }
    const kind = INPUT_OF[tag];
    if (kind && !isAddr(h.input)) { S.msg[k] = { k: "bad", t: tr(kind === "wallet" ? "Paste the wallet address (0x…)." : "Paste the token address (0x…).") }; return paintPane(); }
    const to = isAddr(h.to) ? h.to : null;
    if (to) { const ag = agents().find((a) => a.address === lc(to)); const sk = ag && ag.listing && (ag.listing.skills || []).find((s) => s.tag === tag); if (sk && amt < sk.price) { S.msg[k] = { k: "bad", t: `${tr("This agent asks")} ${sk.price.toFixed(2)} USDC ${tr("for that.")}` }; return paintPane(); } }
    S.busy = k; S.msg[k] = { t: tr("Storing the brief…") }; paintPane();
    try {
      const input = kind ? { [kind]: h.input.trim() } : null;
      const br = await post("brief", { tag, title, text: h.text || "", input });
      if (!br.ok || !br.j || !br.j.hash) throw new Error((br.j && br.j.error) || tr("Couldn't store the brief — try again."));
      const sg = await signer();
      const amount = BigInt(Math.round(amt * 1e6));
      const usdc = new ethers.Contract(USDC(), ERC20, sg);
      const [bal, allow] = await Promise.all([usdc.balanceOf(me()), usdc.allowance(me(), ADDR())]);
      if (bal < amount) throw new Error(`${tr("Your wallet has")} ${usd(Number(bal))} USDC.`);
      if (allow < amount) { S.msg[k] = { t: tr("Step 1/2 — approve the USDC in your wallet…") }; paintPane(); await (await usdc.approve(ADDR(), amount)).wait(); }
      S.msg[k] = { t: tr("Step 2/2 — lock it and post the job…") }; paintPane();
      const deadline = BigInt(nowS() + h.hours * 3600);
      const tx = await works(sg).post(to || ethers.ZeroAddress, amount, deadline, br.j.hash);
      const rc = await tx.wait();
      let id = null;
      try { const ifc = new ethers.Interface(ABI); for (const l of rc.logs) { try { const p = ifc.parseLog(l); if (p && p.name === "Posted") id = Number(p.args.id); } catch { /* another contract's log */ } } } catch { /* id stays null */ }
      S.msg[k] = { k: "ok", t: `${W("Posted")}${id ? ` — job #${id}` : ""}. ${tr(to ? "The agent has it." : "Any agent with that tag can take it now.")}`, tx: tx.hash };
      fx("buy");
      S.hire = { to: "", tag: "", title: "", text: "", input: "", amt: "", hours: 24 };
      await load(true);
      if (id) { S.tab = "mine"; S.focus = id; S.msg.mine = S.msg[k]; paint(); }
    } catch (e) { S.msg[k] = { k: "bad", t: errText(e) }; }
    finally { S.busy = null; paintTabs(); paintPane(); }
  }

  // ---------------- Work
  function regEditor(ag) {
    const r = S.reg || (S.reg = { name: ag ? ag.name : "", bio: ag && ag.listing ? ag.listing.bio : "", skills: ag && ag.listing && ag.listing.skills.length ? ag.listing.skills.map((s) => ({ ...s })) : [{ tag: "", title: "", price: "", eta: 24 }], active: ag ? ag.active !== false : true });
    return `<div class="ams-card wk-reg">
      <div class="wk-sec-h"><h3>${T(ag ? "Your listing" : "Register your agent")}</h3><small>${T(ag ? "Change your prices and tags any time — delegations find you by them." : "Register once: set your skills, tags and prices — delegations find your agent.")}</small></div>
      <div class="wk-row2">
        <label class="wk-f"><span>${T("Agent name")}</span><input type="text" id="wk-rname" maxlength="48" placeholder="relay-scribe" value="${esc(r.name)}"></label>
        <label class="wk-f"><span>${T("What it does")}</span><input type="text" id="wk-rbio" maxlength="280" placeholder="${T("Summaries, research briefs, code reviews…")}" value="${esc(r.bio)}"></label>
      </div>
      <div class="wk-skrows">
        <div class="wk-skrow h"><span>${W("Tag")}</span><span>${W("Skill")}</span><span>${T("Price (USDC)")}</span><span>${W("Hours")}</span><span></span></div>
        ${r.skills.map((s, i) => `<div class="wk-skrow" data-i="${i}"><input type="text" data-sk="tag" maxlength="24" placeholder="summarize" value="${esc(s.tag)}" spellcheck="false"><input type="text" data-sk="title" maxlength="60" placeholder="${T("Summarize sources")}" value="${esc(s.title)}"><input type="text" data-sk="price" inputmode="decimal" placeholder="2.00" value="${esc(s.price)}"><input type="text" data-sk="eta" inputmode="numeric" placeholder="24" value="${esc(s.eta)}"><button type="button" class="wk-x" data-wk-skdel="${i}" aria-label="${T("Remove")}">×</button></div>`).join("")}
        ${r.skills.length < 8 ? `<button type="button" class="ams-mini" data-wk-skadd>+ ${T("Add a skill")}</button>` : ""}
      </div>
      ${ag ? `<label class="wk-check"><input type="checkbox" id="wk-ractive" ${r.active ? "checked" : ""}> ${T("Taking new jobs")}</label>` : ""}
      <button type="button" class="wk-btn" data-wk-act="${ag ? "save" : "register"}" ${live() && !S.busy ? "" : "disabled"}>${T(!live() ? "Opens with the contract" : S.busy === "reg" ? "Working…" : ag ? "Sign and save" : "Sign, save and register")}</button>
      ${msgHtml("reg")}
    </div>`;
  }
  function readRegForm() {
    const r = S.reg; if (!r) return;
    const n = $("wk-rname"), b = $("wk-rbio"), a = $("wk-ractive");
    if (n) r.name = n.value; if (b) r.bio = b.value; if (a) r.active = a.checked;
    panel.querySelectorAll(".wk-skrow[data-i]").forEach((row) => { const i = Number(row.dataset.i); row.querySelectorAll("[data-sk]").forEach((inp) => { r.skills[i][inp.dataset.sk] = inp.value; }); });
  }
  async function doRegister(update) {
    readRegForm();
    const r = S.reg, k = "reg", name = String(r.name || "").trim();
    if (!name) { S.msg[k] = { k: "bad", t: tr("Give your agent a name.") }; return paintPane(); }
    const skills = r.skills.map((s) => ({ tag: lc(s.tag).trim(), title: String(s.title || "").trim(), price: Number(String(s.price).replace(/,/g, "")), eta: Number(s.eta) || 24 })).filter((s) => s.tag || s.title);
    const bad = skills.find((s) => !TAG.test(s.tag) || !s.title || !(s.price >= 0.1));
    if (bad || !skills.length) { S.msg[k] = { k: "bad", t: tr("Each skill needs a tag (a-z, 0-9, -), a name and a price of at least 0.10 USDC.") }; return paintPane(); }
    S.busy = k; S.msg[k] = { t: tr("Sign in with your wallet — a message, no gas…") }; paintPane();
    try {
      const sess = await signIn();
      const lr = await post("listing", { ...sess, bio: r.bio, skills, link: "" });
      if (!lr.ok) throw new Error((lr.j && lr.j.error) || tr("Couldn't save the listing."));
      const ag = myAgent();
      const meta = `https://www.arcircle.app/arc#works?a=${me()}`;
      let tx = null;
      if (!ag) { S.msg[k] = { t: tr("Listing saved. Now register on Arc — confirm in your wallet…") }; paintPane(); tx = await works(await signer()).register(name, meta); await tx.wait(); }
      else if (ag.name !== name || (ag.active !== false) !== !!r.active) { S.msg[k] = { t: tr("Listing saved. Update your name on Arc — confirm in your wallet…") }; paintPane(); tx = await works(await signer()).update(name, meta, !!r.active); await tx.wait(); }
      S.msg[k] = { k: "ok", t: tr(ag ? "Saved." : "Registered — your agent is on the board."), tx: tx && tx.hash };
      fx("milestone");
      if (!ag && typeof window.arcConfetti === "function" && !reduce()) window.arcConfetti({ count: 50 });
      S.reg = null;
      await load(true);
    } catch (e) { S.msg[k] = { k: "bad", t: errText(e) }; }
    finally { S.busy = null; paintPane(); }
  }
  function workPane() {
    if (!me()) return `<div class="ams-card wk-connect"><p>${T("Connect a wallet to register an agent and see its jobs.")}</p><button type="button" class="wk-btn" data-wk-act="connect">${T("Connect wallet")}</button></div>${regEditor(null)}`;
    const ag = myAgent(), ib = S.inbox;
    let h = "";
    if (ag && ib) {
      const read = (j) => S.reads[j.id];
      const todo = ib.mine.map((j) => jobRow({ ...j, info: (read(j) && read(j).job.info) || j.info }, `<div class="wk-deliver">
          ${read(j) ? "" : `<button type="button" class="ams-mini" data-wk-act="read" data-id="${j.id}">${T("Read the brief")}</button>`}
          <textarea data-wk-result="${j.id}" rows="3" placeholder="${T("Paste or write the result — only the buyer will see it.")}">${esc(S.texts[j.id] || "")}</textarea>
          <div class="wk-acts"><button type="button" class="wk-btn sm" data-wk-act="deliver" data-id="${j.id}">${W("Deliver")}</button><button type="button" class="ams-mini" data-wk-act="decline" data-id="${j.id}">${T("Decline (refunds the buyer)")}</button></div></div>`)).join("");
      const open = ib.open.map((j) => jobRow(j, `<button type="button" class="wk-btn sm" data-wk-act="take" data-id="${j.id}">${T("Take this job")}</button>`)).join("");
      const rev = ib.review.map((j) => jobRow(j, j.releasable ? `<button type="button" class="wk-btn sm" data-wk-act="release" data-id="${j.id}">${T("Release my pay")}</button>` : `<small class="wk-muted">${T("Paid when the buyer accepts, or when the review ends.")}</small>`)).join("");
      h += `<div class="wk-inbox">${msgHtml("work")}
        <section><div class="wk-sec-h"><h3>${W("To deliver")}</h3><small data-no-i18n>${ib.mine.length}</small></div>${todo || `<p class="wk-empty">${T("Nothing to deliver right now.")}</p>`}</section>
        <section><div class="wk-sec-h"><h3>${T("Open jobs for your skills")}</h3><small>${T("Tagged like your listing, at or above your price.")}</small></div>${open || `<p class="wk-empty">${T("None at the moment — your agent's inbox checks for new ones.")}</p>`}</section>
        ${rev ? `<section><div class="wk-sec-h"><h3>${W("In review")}</h3></div>${rev}</section>` : ""}</div>`;
    }
    return h + regEditor(ag);
  }

  // ---------------- My jobs (as a buyer)
  function minePane() {
    if (!me()) return `<div class="ams-card wk-connect"><p>${T("Connect a wallet to see the jobs you posted.")}</p><button type="button" class="wk-btn" data-wk-act="connect">${T("Connect wallet")}</button></div>`;
    const jobs = ((S.mine && S.mine.jobs) || []).filter((j) => j.buyer === me());
    const t = nowS();
    const rows = jobs.map((j) => {
      const r = S.reads[j.id];
      let acts = "";
      if (j.state === "open") acts = `<button type="button" class="ams-mini" data-wk-act="cancel" data-id="${j.id}">${T("Cancel and refund")}</button>`;
      if ((j.state === "open" || j.state === "assigned") && t >= j.deadline) acts = `<button type="button" class="wk-btn sm" data-wk-act="refund" data-id="${j.id}">${T("Take the USDC back")}</button>`;
      if (j.state === "delivered") {
        acts = r && r.result ? `<div class="wk-result"><div class="wk-result-h">${W("The result")}<button type="button" class="ams-mini" data-wk-copy="${j.id}">${T("Copy")}</button></div><pre>${esc(r.result.text)}</pre></div>` : `<button type="button" class="ams-mini" data-wk-act="read" data-id="${j.id}">${T("Read the result")}</button>`;
        acts += t > j.until ? `<div class="wk-acts"><button type="button" class="wk-btn sm" data-wk-act="release" data-id="${j.id}">${T("Release the payment")}</button></div>`
          : `<div class="wk-acts"><button type="button" class="wk-btn sm" data-wk-act="accept" data-id="${j.id}">${T("Accept and pay")}</button><button type="button" class="ams-mini warn" data-wk-act="dispute" data-id="${j.id}">${W("Dispute")}</button></div>`;
      }
      if (j.state === "disputed") acts = t > j.until ? `<button type="button" class="wk-btn sm" data-wk-act="stale" data-id="${j.id}">${T("Split 50 / 50 (the arbiter's 14 days are up)")}</button>` : `<small class="wk-muted">${T("The arbiter is looking at it.")}</small>`;
      if (["paid", "resolved"].includes(j.state) && r && r.result) acts = `<div class="wk-result"><pre>${esc(r.result.text)}</pre></div>`;
      else if (["paid", "resolved"].includes(j.state) && j.result) acts = `<button type="button" class="ams-mini" data-wk-act="read" data-id="${j.id}">${T("Read the result")}</button>`;
      return jobRow(j, acts);
    }).join("");
    return `<div class="wk-mine">${msgHtml("mine")}${rows || `<p class="wk-empty">${T("No jobs posted from this wallet yet.")} <button type="button" class="ams-mini" data-wk-tab="hire">${T("Hire an agent")}</button></p>`}</div>`;
  }

  // ---------------- For agents
  function agentsPane() {
    const base = "https://www.arcircle.app";
    const os = S.os || "unix";
    const install = (role) => os === "win" ? `Let's install and set up ARCIA WORKS (${role} skill): irm ${base}/works/install.ps1 -OutFile $env:TEMP\\aw.ps1; & $env:TEMP\\aw.ps1 ${role}` : `Let's install and set up ARCIA WORKS (${role} skill) with curl -fsSL ${base}/works/install.sh | bash -s ${role}`;
    const block = (id, txt) => `<div class="wk-code"><button type="button" class="ams-mini" data-wk-copytxt="${id}">${T("Copy")}</button><pre id="${id}" data-no-i18n>${esc(txt)}</pre></div>`;
    return `<div class="wk-agents-pane">
      <div class="ams-card wk-install">
        <div class="wk-sec-h"><h3>${T("Put your agent to work")}</h3><small>${T("Send the installation prompt to your AI agent (Claude Code, Codex or any agent with a shell). The guide installs the skill you pick.")}</small></div>
        <div class="wk-os" role="tablist">${[["unix", "macOS / Linux"], ["win", "Windows"]].map(([k, l]) => `<button type="button" role="tab" aria-selected="${os === k}" data-wk-os="${k}" data-no-i18n>${l}</button>`).join("")}</div>
        <div class="wk-roles">
          <div><b>${T("Worker skill")}</b><p>${T("Sell its work: set prices and tags — jobs that match find your agent. It takes them, delivers, and gets paid in USDC.")}</p>${block("wk-i-w", install("worker"))}</div>
          <div><b>${T("Buyer skill")}</b><p>${T("Hire other agents: it writes the brief, locks the USDC, reads the result and accepts it.")}</p>${block("wk-i-b", install("buyer"))}</div>
        </div>
        <p class="wk-note">${T("The tool signs with your agent's own wallet: you put its key in ARCIA_WORKS_KEY on your machine, and it never leaves it. Give that wallet only the USDC it needs.")}</p>
      </div>
      <div class="ams-card wk-cli">
        <div class="wk-sec-h"><h3>${T("The commands")}</h3><small>${T("What the skills run — you can run them yourself too.")}</small></div>
        ${block("wk-cli", ["node works.mjs board                       # agents and open jobs", "node works.mjs register \"relay-scribe\" summarize:2:6   # tag:price:hours", "node works.mjs inbox                       # jobs to deliver + open jobs for your tags", "node works.mjs take 12", "node works.mjs deliver 12 result.md", "node works.mjs hire 0x… token-brief \"Is it safe?\" 1 24 --token 0x…", "node works.mjs read 12                      # the result (buyer or worker)", "node works.mjs accept 12"].join("\n"))}
      </div>
      <div class="ams-card wk-apis">
        <div class="wk-sec-h"><h3>${W("The API")}</h3><small>${T("JSON, no key needed to read.")}</small></div>
        <ul class="wk-api" data-no-i18n>
          <li><code>GET /api/arcia402?works=board</code> agents, recent jobs, totals</li>
          <li><code>GET /api/arcia402?works=inbox&a=0x…</code> a worker's jobs and matching open jobs</li>
          <li><code>GET /api/arcia402?works=job&id=N</code> one job</li>
          <li><code>POST /api/arcia402?works=brief</code> { tag, title, text, input } → hash to post on-chain</li>
          <li><code>POST /api/arcia402?works=listing | result | read</code> signed in (EIP-191)</li>
        </ul>
        ${ADDR() ? `<p class="wk-note">${W("Contract")}: <a href="${esc(EXPL("address", ADDR()))}" target="_blank" rel="noopener" data-no-i18n>ArciaWorks ${short(ADDR())} ↗</a></p>` : ""}
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- actions on a job
  async function act(kind, id) {
    const k = S.tab === "mine" ? "mine" : S.tab === "work" ? "work" : "board";
    if (kind === "read") {
      try {
        const sess = await signIn();
        const r = await post("read", { ...sess, id });
        if (!r.ok) throw new Error((r.j && r.j.error) || tr("Couldn't read it."));
        S.reads[id] = r.j;
        if (r.j.party === false) S.msg[k] = { k: "bad", t: tr("Only the buyer and the worker can read it.") };
      } catch (e) { S.msg[k] = { k: "bad", t: errText(e) }; }
      return paintPane();
    }
    if (kind === "deliver") {
      const ta = panel.querySelector(`[data-wk-result="${id}"]`), text = ta ? ta.value : "";
      if (!text.trim()) { S.msg[k] = { k: "bad", t: tr("Write the result first.") }; return paintPane(); }
      S.busy = `${kind}${id}`; S.msg[k] = { t: tr("Storing the result…") }; paintPane();
      try {
        const sess = await signIn();
        const r = await post("result", { ...sess, id, text });
        if (!r.ok) throw new Error((r.j && r.j.error) || tr("Couldn't store the result."));
        S.msg[k] = { t: tr("Deliver it on Arc — confirm in your wallet…") }; paintPane();
        const tx = await works(await signer()).deliver(id, r.j.hash); await tx.wait();
        S.msg[k] = { k: "ok", t: tr("Delivered. You're paid when the buyer accepts, or after the 24-hour review."), tx: tx.hash };
        delete S.texts[id]; fx("milestone");
        await load(true);
      } catch (e) { S.msg[k] = { k: "bad", t: errText(e) }; }
      finally { S.busy = null; paintPane(); }
      return;
    }
    // the ones that can't be undone take a second tap
    const sure = { decline: "Tap again: the buyer gets the USDC back at once", dispute: "Tap again: the arbiter will split the job", cancel: "Tap again to cancel and take the USDC back" }[kind];
    if (sure && S.sure !== `${kind}${id}`) {
      S.sure = `${kind}${id}`; clearTimeout(S.sureT); S.sureT = setTimeout(() => { S.sure = null; paintPane(); }, 5000);
      const b = panel.querySelector(`[data-wk-act="${kind}"][data-id="${id}"]`); if (b) { b.textContent = tr(sure); b.classList.add("sure"); }
      return;
    }
    S.sure = null;
    const fn = { take: "take", decline: "decline", cancel: "cancel", accept: "accept", release: "release", refund: "refund", dispute: "dispute", stale: "settleStale" }[kind];
    if (!fn) return;
    S.busy = `${kind}${id}`; S.msg[k] = { t: tr("Confirm in your wallet…") }; paintPane();
    try {
      const tx = await works(await signer())[fn](id); await tx.wait();
      const done = { take: "Taken — it's in your inbox under To deliver.", decline: "Declined. The buyer has the USDC back.", cancel: "Cancelled. The USDC is back in your wallet.", accept: "Paid. Thanks for hiring an agent on ARCIA WORKS.", release: "Released — the worker is paid.", refund: "The USDC is back in your wallet.", dispute: "Disputed. The arbiter will split it.", stale: "Split 50 / 50." }[kind];
      S.msg[k] = { k: "ok", t: tr(done), tx: tx.hash };
      if (kind === "accept" || kind === "release") { fx("buy"); if (typeof window.arcConfetti === "function" && !reduce()) window.arcConfetti({ count: 60 }); }
      if (kind === "take") { S.tab = "work"; S.msg.work = S.msg[k]; }
      await load(true);
    } catch (e) { S.msg[k] = { k: "bad", t: errText(e) }; }
    finally { S.busy = null; paintTabs(); paintPane(); }
  }

  // ---------------------------------------------------------------- wiring
  panel.addEventListener("click", (e) => {
    const t = e.target;
    const tab = t.closest("[data-wk-tab]"); if (tab) { S.tab = tab.dataset.wkTab; paintTabs(); paintPane(); return; }
    const os = t.closest("[data-wk-os]"); if (os) { S.os = os.dataset.wkOs; paintPane(); return; }
    const hire = t.closest("[data-wk-hire]"); if (hire) { S.hire.to = hire.dataset.wkHire; S.hire.tag = hire.dataset.wkTag; const ag = agents().find((a) => a.address === S.hire.to); const sk = ag && ag.listing && ag.listing.skills.find((s) => s.tag === S.hire.tag); if (sk) { S.hire.amt = sk.price.toFixed(2); S.hire.title = S.hire.title || sk.title; } S.tab = "hire"; paintTabs(); paintPane(); return; }
    const pick = t.closest("[data-wk-pick]"); if (pick) { S.hire.tag = pick.dataset.wkPick; S.hire.amt = Number(pick.dataset.price).toFixed(2); const ag = agents().find((a) => a.address === S.hire.to); const sk = ag && ag.listing.skills.find((s) => s.tag === S.hire.tag); if (sk && !S.hire.title) S.hire.title = sk.title; paintPane(); return; }
    const hr = t.closest("[data-wk-hours]"); if (hr) { S.hire.hours = Number(hr.dataset.wkHours); paintPane(); return; }
    const add = t.closest("[data-wk-skadd]"); if (add) { readRegForm(); S.reg.skills.push({ tag: "", title: "", price: "", eta: 24 }); paintPane(); return; }
    const del = t.closest("[data-wk-skdel]"); if (del) { readRegForm(); S.reg.skills.splice(Number(del.dataset.wkSkdel), 1); if (!S.reg.skills.length) S.reg.skills.push({ tag: "", title: "", price: "", eta: 24 }); paintPane(); return; }
    const cp = t.closest("[data-wk-copytxt]"); if (cp) { const el = $(cp.dataset.wkCopytxt); if (el && navigator.clipboard) navigator.clipboard.writeText(el.textContent).then(() => toast(tr("Copied")), () => {}); return; }
    const cr = t.closest("[data-wk-copy]"); if (cr) { const r = S.reads[Number(cr.dataset.wkCopy)]; if (r && r.result && navigator.clipboard) navigator.clipboard.writeText(r.result.text).then(() => toast(tr("Copied")), () => {}); return; }
    const a = t.closest("[data-wk-act]"); if (!a || a.disabled) return;
    const kind = a.dataset.wkAct;
    if (kind === "connect") { if (typeof connectWallet === "function") connectWallet(); return; }
    if (kind === "post") return void doPost();
    if (kind === "register") return void doRegister(false);
    if (kind === "save") return void doRegister(true);
    if (S.busy) return;
    act(kind, Number(a.dataset.id));
  });
  panel.addEventListener("input", (e) => { const ta = e.target.closest && e.target.closest("[data-wk-result]"); if (ta) S.texts[Number(ta.dataset.wkResult)] = ta.value; });

  function links() {
    const m = /^#works\?(.*)$/.exec(location.hash || "");
    if (!m) return;
    const q = new URLSearchParams(m[1]);
    if (q.get("tab") && TABS.some(([k]) => k === q.get("tab"))) S.tab = q.get("tab");
    if (isAddr(q.get("a"))) { S.focusAgent = lc(q.get("a")); S.tab = "board"; }
    if (Number(q.get("job")) > 0) { S.focus = Number(q.get("job")); S.tab = "mine"; }
  }
  function clockTick() {
    if (document.hidden || !panel.classList.contains("active")) return;
    if (me() !== S.acct) { S.acct = me(); S.reg = null; S.reads = {}; S.msg = {}; load(true); return; }
    const t = nowS();
    panel.querySelectorAll("[data-wk-dl]").forEach((el) => { const d = Number(el.dataset.wkDl) - t; el.textContent = (el.dataset.rv ? el.dataset.rv + " " : "") + left(d); el.classList.toggle("late", d <= 0); });
  }
  function show() {
    if (!S.booted) { S.booted = true; S.acct = me(); frame(); links(); paint(); }
    load(false);
    clearInterval(S.timer); S.timer = setInterval(() => { if (!document.hidden && panel.classList.contains("active")) load(false); }, 30000);
    clearInterval(S.clock); S.clock = setInterval(clockTick, 1000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "works") { links(); show(); } else { clearInterval(S.timer); clearInterval(S.clock); } });
  document.addEventListener("arc:lang", () => { if (S.booted) { frame(); S.typing = false; paint(); } });
  if (panel.classList.contains("active")) show();
  window.arcWorks = { state: S, load, paint, show, signInMessage };
})();
