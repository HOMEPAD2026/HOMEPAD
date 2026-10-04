/* global CONFIG, state, ethers, connectWallet, cpToast, applyCirclepadState, renderCirclepadLeaderboard, _circlepadState */
// circlepad-v5.js — CirclePad v5, on top of the other CirclePad layers (it only adds; the escrow, the round and the
// leaderboard stay where they are):
//   · each round has its own accent (CONFIG.CIRCLEPAD_GOV[n].accent), and the round number flips when a new round
//     opens (once per browser)
//   · the round box: the top contributor and the latest contribution; on phones a compact strip instead of a square
//   · the sidebar status follows the whole round: live with the time left → closed → split → delivered
//   · "Source verified" asks the explorer about the running round's escrow (/api/social?circle=src)
//   · Bring USDC from another chain: Circle's CCTP from Ethereum, Base, Arbitrum, OP, Polygon or Avalanche to your own
//     address on Arc, minted there by Circle's Forwarding Service (no Arc gas needed), then contribute as usual
//   · Projects: a results strip for every closed round (raise, contributors, $ARCIRCLE burned, the coin today)
//   · motion: the USDC coin drops into the circle after a contribution, the raise's route (Arc → Robinhood Chain →
//     $ARCIA → you) flows on rounds that buy a coin, the last hour pulses the screen edge and the contribute button
//   · ARCIA's button tucks to the edge while it would cover the round's text and buttons
// Everything with motion stops under "reduce motion".
(function () {
  "use strict";
  if (typeof CONFIG === "undefined" || !document.getElementById("bp-panel-home")) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  // whole sentences per language (fragments can't go through the dictionary): L(en, ko, zh), already escaped by the caller
  const lang = () => (window.arcI18n && window.arcI18n.get ? window.arcI18n.get() : "en");
  const L = (en, ko, zh) => { const g = lang(); return g === "ko" && ko ? ko : g === "zh" && zh ? zh : en; };
  const RN = (n) => L(`Round #${n}`, `라운드 #${n}`, `第 ${n} 轮`);
  const reduce = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const phone = () => window.innerWidth <= 760;
  const N = () => Number(CONFIG.CIRCLEPAD_ROUND || 1);
  const GOV = () => (CONFIG.CIRCLEPAD_GOV || {})[N()] || {};
  const PLAN = () => (GOV().plan && GOV().plan.buy) || null;
  const short = (a) => (a ? String(a).slice(0, 6) + "…" + String(a).slice(-4) : "");
  const num = (n, d = 2) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: d });
  const usdOf = (wei) => { try { return Number(ethers.formatEther(BigInt(wei || 0))); } catch { return 0; } };
  // the chain's clock when circlepad-round.js knows it (countdowns run on it), else this device's
  const nowS = () => { try { const r = window.circlepadRound; const t = r && r.nowS ? Number(r.nowS()) : NaN; if (isFinite(t) && t > 0) return Math.floor(t); } catch { /* fall through */ } return Math.floor(Date.now() / 1000); };
  const body = document.body;
  const S = () => (typeof _circlepadState !== "undefined" ? _circlepadState : null);
  const rounds = () => window.cpRoundsData || null;
  const curRound = () => { const d = rounds(); return d && Array.isArray(d.rounds) ? d.rounds.find((r) => r.n === N()) || null : null; };
  const marks = () => (curRound() && curRound().marks) || {};
  const left = (s) => { const d = Math.max(0, s); const h = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60); return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m}m`; };

  // ================= the round's own accent =================
  const acc = GOV().accent;
  if (acc && /^#[0-9a-fA-F]{6}$/.test(acc)) {
    body.style.setProperty("--cp-round-acc", acc);
    body.classList.add("cp5-acc");
  }
  body.dataset.cpRound = String(N());

  // ================= the round number flips when a new round opens (once per browser) =================
  (function flip() {
    let seen = 0;
    try { seen = Number(localStorage.getItem("cp5.seenRound") || 0); localStorage.setItem("cp5.seenRound", String(N())); } catch { return; }
    if (!seen || seen >= N() || reduce()) return;
    const o = document.createElement("div");
    o.className = "cp5-flip"; o.setAttribute("role", "status");
    o.innerHTML = `<div class="cp5-flip-card"><span data-no-i18n>CirclePad</span><div class="cp5-flip-n" data-no-i18n><b class="from">#${seen}</b><b class="to">#${N()}</b></div><em>${T("A new round is here")}</em></div>`;
    body.appendChild(o);
    requestAnimationFrame(() => o.classList.add("go"));
    if (typeof window.arcFeedback === "function") setTimeout(() => window.arcFeedback("milestone"), 700);
    const done = () => { o.classList.add("out"); setTimeout(() => o.remove(), 500); };
    o.addEventListener("click", done);
    setTimeout(done, 2600);
  })();

  // ================= "Source verified": the running round's escrow, asked of the explorer =================
  (async function verified() {
    const e = String(CONFIG.CIRCLEPAD_ESCROW_ADDRESS || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(e)) return;
    try {
      const r = await fetch(`/api/social?circle=src&escrow=${e}`);
      const j = r.ok ? await r.json() : null;
      if (!j || j.verified == null) return;
      window.cpEscrowVerified = !!j.verified;
      try { keys(); } catch { /* next paint */ }
      document.querySelectorAll(".cpx-badge").forEach((b) => {
        if (!/verified/i.test(b.textContent)) return;
        b.classList.toggle("ok", j.verified); b.classList.toggle("no", !j.verified);
        b.textContent = tr(j.verified ? "Source verified" : "Source not verified yet");
      });
    } catch { /* keep the page's answer */ }
  })();

  // ================= the round box: top contributor and the latest contribution =================
  let lbRows = [], lbAct = [];
  function paintBox() {
    const media = document.querySelector("#bp-featured .cp-media");
    if (!media) return;
    let box = media.querySelector(".cp5-lead");
    if (!lbRows.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement("span"); box.className = "cp5-lead"; media.appendChild(box); }
    const top = lbRows[0], last = (lbAct || []).find((a) => a.kind !== "refund" && a.kind !== "withdraw");
    const sh = (a) => (a ? String(a).slice(0, 5) + "…" + String(a).slice(-3) : "");
    box.innerHTML = `<span class="cp5-lead-r"><i data-no-i18n>${esc(L("Top", "1위", "第一"))}</i><em data-no-i18n>${num(usdOf(top.amount), 0)}</em><b data-no-i18n>${esc(sh(top.address))}</b></span>` +
      (last ? `<span class="cp5-lead-r"><i data-no-i18n>${esc(L("Latest", "최근", "最新"))}</i><em data-no-i18n>+${num(usdOf(last.amount), 0)}</em><b data-no-i18n>${esc(sh(last.contributor))}</b></span>` : "");
  }
  if (typeof renderCirclepadLeaderboard === "function") {
    const origLb = renderCirclepadLeaderboard;
    // eslint-disable-next-line no-global-assign
    renderCirclepadLeaderboard = function (rows, activity, flow) {
      origLb(rows, activity, flow);
      try { lbRows = rows || []; lbAct = activity || []; paintBox(); keys(); } catch (e) { console.warn("circlepad-v5", e); }
    };
  }

  // ================= phones: Transparency folded to four numbers =================
  function keys() {
    const card = $("cpx-trust"), s = S();
    if (!card || !s) return;
    let k = card.querySelector(".cp5-keys");
    if (!k) { k = document.createElement("div"); k.className = "cp5-keys"; const h = card.querySelector(".cpx-trust-head"); if (h) h.insertAdjacentElement("afterend", k); else card.prepend(k); }
    const amts = lbRows.map((r) => usdOf(r.amount)).filter((x) => x > 0).sort((a, b) => a - b);
    const total = amts.reduce((t, x) => t + x, 0);
    const median = amts.length ? (amts.length % 2 ? amts[(amts.length - 1) / 2] : (amts[amts.length / 2 - 1] + amts[amts.length / 2]) / 2) : 0;
    const largest = total > 0 ? (amts[amts.length - 1] / total) * 100 : 0;
    const ver = window.cpEscrowVerified;
    k.setAttribute("data-no-i18n", "");
    k.innerHTML = [[L("In the escrow", "에스크로 잔액", "托管余额"), `${num(usdOf(s.balance), 0)} USDC`], [L("Wallets in", "참여 지갑", "参与钱包"), String(amts.length)], [L("Median", "중간값", "中位数"), `${num(median, 0)} USDC`], [L("Largest wallet", "최대 지갑 비중", "最大钱包占比"), `${num(largest, 1)}%`]]
      .map(([t, v]) => `<div><span>${esc(t)}</span><b>${esc(v)}</b></div>`).join("") + (ver != null ? `<p class="cp5-keys-v ${ver ? "ok" : ""}">${esc(ver ? L("Source verified on the explorer", "익스플로러에서 소스 검증됨", "源码已在浏览器验证") : L("Source not verified yet", "소스 미검증", "源码尚未验证"))}</p>` : "");
  }

  // ================= the sidebar status: the whole round =================
  function sideStatus() {
    const s = S(), txt = $("bp-side-foot-text"), dot = $("bp-side-status-dot");
    if (!s || !txt || !s.started) return;
    const m = marks(), deadline = Number(s.deadline), raised = num(usdOf(s.totalRaised), 0), plan = PLAN();
    let t = "", k = "";
    const n = N(), lf = left(deadline - nowS());
    if (s.isOpen && nowS() < deadline) { t = L(`Round #${n} is live · ${lf} left · ${raised} USDC`, `라운드 #${n} 진행 중 · ${lf} 남음 · ${raised} USDC`, `第 ${n} 轮进行中 · 剩余 ${lf} · ${raised} USDC`); k = "live"; }
    else if (m.launch) { t = L(`Round #${n} is delivered — thank you 💚`, `라운드 #${n} 배분 완료 — 감사해요 💚`, `第 ${n} 轮已完成发放 — 谢谢 💚`); k = "done"; }
    else if (s.distributed) { t = plan ? L(`Split done — buying $${plan.sym} and sending it to contributors`, `분배 완료 — $${plan.sym}를 사서 참여자에게 보내는 중`, `已分配 — 正在买入 $${plan.sym} 并发给参与者`) : L("Split done — the launch and the airdrop are next", "분배 완료 — 다음은 런칭과 에어드랍", "已分配 — 接下来是上线和空投"); k = "split"; }
    else { t = L(`Round #${n} has closed · ${raised} USDC · the split is next`, `라운드 #${n} 마감 · ${raised} USDC · 다음은 분배`, `第 ${n} 轮已结束 · ${raised} USDC · 接下来分配`); k = "closed"; }
    txt.textContent = t;
    txt.setAttribute("data-no-i18n", "");
    if (dot) dot.className = "bp-side-status-dot cp5-st-" + k + (k === "live" ? " bp-live" : "");
  }
  if (typeof applyCirclepadState === "function") {
    const origApply = applyCirclepadState;
    // eslint-disable-next-line no-global-assign
    applyCirclepadState = function (s, opts) {
      origApply(s, opts);
      try { sideStatus(); lastHour(); route(); keys(); } catch (e) { console.warn("circlepad-v5", e); }
    };
  }
  document.addEventListener("circlepad:rounds", () => { try { sideStatus(); route(); results(); } catch (e) { console.warn("circlepad-v5", e); } });
  setInterval(() => { if (!document.hidden) { try { sideStatus(); lastHour(); } catch { /* next time */ } } }, 30000);

  // ================= the last hour: the screen edge and the contribute button =================
  function lastHour() {
    const s = S();
    const on = !!(s && s.started && s.isOpen && Number(s.deadline) - nowS() > 0 && Number(s.deadline) - nowS() < 3600);
    body.classList.toggle("cp5-final", on && !reduce());
    const btn = $("bp-contribute-btn");
    if (btn) btn.classList.toggle("cp5-final-btn", on);
    if (on && !document.querySelector(".cp5-edge")) { const e = document.createElement("div"); e.className = "cp5-edge"; e.setAttribute("aria-hidden", "true"); body.appendChild(e); }
  }

  // ================= the coin drops into the circle =================
  document.addEventListener("circlepad:contributed", (e) => {
    const amt = Number(e.detail && e.detail.amount) || 0;
    const ring = document.querySelector("#bp-round-panel .cp-ring") || $("bp-round-panel");
    const from = $("bp-contribute-btn") || ring;
    if (!ring || !from) return;
    if (typeof window.arcFeedback === "function") window.arcFeedback("buy");
    const a = from.getBoundingClientRect(), b = ring.getBoundingClientRect();
    const plus = document.createElement("div");
    plus.className = "cp5-plus"; plus.textContent = `+${num(amt)} USDC`;
    plus.style.left = b.left + b.width / 2 + "px"; plus.style.top = b.top + b.height / 2 + "px";
    if (reduce()) { body.appendChild(plus); setTimeout(() => plus.remove(), 1600); return; }
    const coin = document.createElement("div");
    coin.className = "cp5-coin"; coin.setAttribute("aria-hidden", "true");
    coin.innerHTML = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18"/><text x="20" y="26" text-anchor="middle">$</text></svg>';
    body.appendChild(coin);
    const x0 = a.left + a.width / 2 - 20, y0 = a.top - 10, x1 = b.left + b.width / 2 - 20, y1 = b.top + b.height / 2 - 20;
    const anim = coin.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.6) rotateY(0deg)`, opacity: 0 },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 120}px) scale(1.15) rotateY(540deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1}px) scale(.35) rotateY(900deg)`, opacity: 0.2 },
    ], { duration: 1100, easing: "cubic-bezier(.3,.7,.4,1)" });
    anim.onfinish = () => {
      coin.remove();
      ring.classList.remove("cp5-gulp"); void ring.offsetWidth; ring.classList.add("cp5-gulp");
      body.appendChild(plus); setTimeout(() => plus.remove(), 1700);
      if (typeof window.arcConfetti === "function") window.arcConfetti({ count: 40 });
    };
  });

  // ================= the raise's route, on rounds that buy a coin (Round #3: Arc → Robinhood Chain → $ARCIA → you) ====
  function route() {
    const plan = PLAN();
    if (!plan) return;
    let el = $("cp5-route");
    if (!el) {
      const after = $("bp-featured");
      if (!after) return;
      el = document.createElement("section");
      el.id = "cp5-route"; el.className = "cp5-route";
      after.insertAdjacentElement("afterend", el);
    }
    const s = S() || {}, m = marks();
    const at = !s.started ? -1 : s.isOpen && nowS() < Number(s.deadline) ? 0 : !s.distributed ? 1 : !m.launch ? 2 : 4;
    const st = (i) => (at > i ? "done" : at === i ? "now" : "");
    const also = GOV().plan && GOV().plan.also;
    const nodes = [
      ["USDC", L("Your USDC", "내 USDC", "你的 USDC"), L("Arc · the escrow", "Arc · 에스크로", "Arc · 托管合约")],
      ["80%", L("The split", "분배", "分配"), L("80% buys the coin", "80%로 코인 매수", "80% 用于买币")],
      ["ETH", L("To Robinhood Chain", "Robinhood Chain으로", "转到 Robinhood Chain"), L("bridged by the team", "팀이 브릿지", "由团队跨链")],
      [`$${plan.sym}`, L(`Buys $${plan.sym}`, `$${plan.sym} 매수`, `买入 $${plan.sym}`), plan.chain || "Robinhood Chain"],
      ["♥", L("To you", "나에게", "发给你"), L("by your share of the raise", "내 참여 비율대로", "按你的出资比例")],
    ];
    el.innerHTML = `<div class="cp5-route-h"><h3>${T("Where your USDC goes")}</h3><span data-no-i18n>${esc(RN(N()))}${also ? ` · ${esc(L(`plus Round #${also.round} on ${also.chain}`, `+ ${also.chain}의 라운드 #${also.round}`, `另有 ${also.chain} 上的第 ${also.round} 轮`))}` : ""}</span></div>
      <ol class="cp5-route-l">${nodes.map(([ic, t1, t2], i) => `<li class="${st(i)}"><span class="cp5-route-ic${ic.length > 4 ? " long" : ""}" data-no-i18n>${esc(ic)}</span><b data-no-i18n>${esc(t1)}</b><small data-no-i18n>${esc(t2)}</small></li>`).join("")}</ol>
      <div class="cp5-route-flow" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => `<i style="--d:${i}"></i>`).join("")}</div>`;
    el.dataset.at = String(at);
  }

  // ================= Projects: every closed round's result =================
  const COINS = CONFIG.CIRCLEPAD_RESULTS || {};
  const mk = new Map();
  async function market(c) {
    const k = c.chain + ":" + c.token.toLowerCase();
    const hit = mk.get(k);
    if (hit && Date.now() - hit.at < 120e3) return hit.v;
    let v = null;
    try {
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${c.token}`);
      const j = r.ok ? await r.json() : null;
      const want = c.chain === "rh" ? "robinhood" : "arc";
      const ps = (j && j.pairs || []).filter((p) => p && p.chainId === want).sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
      const p = ps[0];
      if (p) v = { mcap: Number(p.marketCap || p.fdv || 0) || null, liq: ps.reduce((t, x) => t + ((x.liquidity && x.liquidity.usd) || 0), 0), ch: p.priceChange && p.priceChange.h24 != null ? Number(p.priceChange.h24) : null, url: p.url || null };
    } catch { v = null; }
    mk.set(k, { at: Date.now(), v });
    return v;
  }
  const big$ = (n) => (n == null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`);
  async function results() {
    const d = rounds(), panel = $("bp-panel-projects");
    if (!d || !panel) return;
    const closed = d.rounds.filter((r) => r.state && r.state.started && nowS() >= Number(r.state.deadline));
    if (!closed.length) return;
    let el = $("cp5-results");
    if (!el) {
      el = document.createElement("section");
      el.id = "cp5-results"; el.className = "cp5-results";
      // under the page's title and its one-line intro, above the round cards
      const host = panel.querySelector(".bp-simple") || panel;
      const intro = host.querySelector("h1 + p") || host.querySelector("h1");
      if (intro) intro.insertAdjacentElement("afterend", el); else host.insertBefore(el, host.firstChild);
    }
    const cards = closed.slice().reverse().map((r) => {
      const sm = (d.sums || {})[r.n] || null, c = COINS[r.n] || null;
      const raised = usdOf(r.state.totalRaised), people = sm && sm.board ? sm.board.contributors : null;
      const burned = sm && sm.ballot ? Number(sm.ballot.burned || 0) : null;
      const coin = c && c.merged ? `<span class="cp5-rs-coin merged" data-no-i18n>${esc(L(`Merged into Round #${c.merged}`, `라운드 #${c.merged}에 합쳐짐`, `并入第 ${c.merged} 轮`))}</span>` : c ? `<span class="cp5-rs-coin" data-no-i18n>$${esc(c.sym)} <i>${esc(c.chain === "rh" ? "Robinhood Chain" : "Arc")}</i></span>` : "";
      return `<article class="cp5-rs" data-n="${r.n}" data-no-i18n><div class="cp5-rs-top"><b>${esc(RN(r.n))}</b>${coin}</div>
        <dl><div><dt>${esc(L("Raised", "모금액", "募集"))}</dt><dd>${num(raised, 0)} USDC</dd></div><div><dt>${esc(L("Contributors", "참여자", "参与者"))}</dt><dd>${people != null ? people : "—"}</dd></div>${burned ? `<div><dt>${esc(L("$ARCIRCLE burned", "$ARCIRCLE 소각", "$ARCIRCLE 销毁"))}</dt><dd>${num(burned, 0)}</dd></div>` : ""}
        ${c && c.token && !c.merged ? `<div class="cp5-rs-m" data-mk="${esc(c.chain)}:${esc(c.token)}"><dt>${esc(L("Market cap today", "현재 시가총액", "当前市值"))}</dt><dd>…</dd></div>` : ""}</dl>
        <div class="cp5-rs-foot">${r.n === 1 ? `<a href="/circle/round/1">${esc(L("Round report", "라운드 리포트", "轮次报告"))} →</a>` : ""}${c && c.token && !c.merged ? `<a href="${c.chain === "rh" ? "/arc#orders?c=rh&t=" + esc(c.token) : "/arc#coin/" + esc(c.token)}">${esc(L(`Trade $${c.sym}`, `$${c.sym} 거래`, `交易 $${c.sym}`))} →</a>` : ""}</div></article>`;
    });
    el.innerHTML = `<div class="cp5-rs-h"><h3>${T("Round results")}</h3><span>${T("Every closed round, read from the chain")}</span></div><div class="cp5-rs-grid">${cards.join("")}</div>`;
    for (const box of el.querySelectorAll("[data-mk]")) {
      const [chain, token] = box.dataset.mk.split(":");
      market({ chain, token }).then((v) => {
        const dd = box.querySelector("dd");
        if (!dd) return;
        dd.innerHTML = v ? `${esc(big$(v.mcap))}${v.ch != null ? ` <small class="${v.ch >= 0 ? "up" : "dn"}">${v.ch >= 0 ? "+" : ""}${v.ch.toFixed(1)}% 24h</small>` : ""}` : "—";
      });
    }
  }

  // ================= ARCIA's button tucks to the edge while it sits over the round (it covered text and buttons) =================
  let fabRaf = 0;
  function fabCheck() {
    fabRaf = 0;
    const fab = document.querySelector(".aa-fab");
    if (!fab) return;
    if (!$("bp-panel-home") || !$("bp-panel-home").classList.contains("active")) { body.classList.remove("cp5-fab-tuck"); return; }
    const f = fab.getBoundingClientRect();
    const hit = [...document.querySelectorAll("#bp-featured, #cp5-route, .cp-timeline, #cpx-trust")].some((el) => {
      const r = el.getBoundingClientRect();
      return r.height > 0 && f.top < r.bottom - 8 && f.bottom > r.top + 8 && f.left < r.right && f.right > r.left;
    });
    body.classList.toggle("cp5-fab-tuck", hit);
  }
  const fabSoon = () => { if (!fabRaf) fabRaf = requestAnimationFrame(fabCheck); };
  addEventListener("scroll", fabSoon, { passive: true });
  addEventListener("resize", fabSoon);
  setTimeout(fabCheck, 1500);
  window.cp5FabCheck = fabCheck;

  // ================= Bring USDC from another chain (Circle CCTP → your address on Arc) =================
  // TokenMessengerV2 / USDC addresses: developers.circle.com (CCTP EVM contracts; USDC contract addresses).
  // Arc is CCTP domain 26; the Forwarding Service mints on Arc for the sender, so no Arc gas is needed.
  const TM = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
  const HOOK = "0x636374702d666f72776172640000000000000000000000000000000000000000"; // "cctp-forward", version 0
  const CH = [
    { id: 8453, d: 6, name: "Base", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", rpc: "https://mainnet.base.org", ex: "https://basescan.org", gas: "ETH" },
    { id: 42161, d: 3, name: "Arbitrum", usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", rpc: "https://arb1.arbitrum.io/rpc", ex: "https://arbiscan.io", gas: "ETH" },
    { id: 10, d: 2, name: "OP Mainnet", usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", rpc: "https://mainnet.optimism.io", ex: "https://optimistic.etherscan.io", gas: "ETH" },
    { id: 1, d: 0, name: "Ethereum", usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", rpc: "https://ethereum-rpc.publicnode.com", ex: "https://etherscan.io", gas: "ETH" },
    { id: 137, d: 7, name: "Polygon", usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", rpc: "https://polygon-rpc.com", ex: "https://polygonscan.com", gas: "POL" },
    { id: 43114, d: 1, name: "Avalanche", usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", rpc: "https://api.avax.network/ext/bc/C/rpc", ex: "https://snowtrace.io", gas: "AVAX" },
  ];
  const ERC20 = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];
  const TMABI = ["function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes hookData)"];
  const PKEY = "cp5.bridge.pending";
  const rejected = (e) => e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|cancel/i.test(String(e.message || e.shortMessage || "")));
  const walletProv = () => (typeof state !== "undefined" && state && state.walletProvider) || window.ethereum || null;
  const me = () => (typeof state !== "undefined" && state && state.account ? String(state.account).toLowerCase() : "");
  const B = { ch: CH[0], fees: null, bal: null, busy: false, msg: "", step: 0, pending: null, poll: null };
  try { B.pending = JSON.parse(localStorage.getItem(PKEY) || "null"); } catch { B.pending = null; }

  async function toChain(c) {
    const hex = "0x" + c.id.toString(16);
    if (typeof WagmiCoreRef !== "undefined" && WagmiCoreRef && typeof wagmiConfigRef !== "undefined" && wagmiConfigRef) {
      try {
        const acc = WagmiCoreRef.getAccount(wagmiConfigRef);
        if (acc && acc.isConnected) { if (Number(acc.chainId) !== c.id) await WagmiCoreRef.switchChain(wagmiConfigRef, { chainId: c.id }); return; }
      } catch (e) { if (rejected(e)) throw e; }
    }
    const p = walletProv();
    if (!p) throw new Error(tr("No wallet found."));
    if (Number.parseInt(await p.request({ method: "eth_chainId" }), 16) === c.id) return;
    try { await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }); }
    catch (e) {
      if (rejected(e)) throw e;
      await p.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: c.name, rpcUrls: [c.rpc], blockExplorerUrls: [c.ex], nativeCurrency: { name: c.gas, symbol: c.gas, decimals: 18 } }] });
    }
  }
  async function signerOn(c) {
    window.arcChainSwitching = true; // the wallet layer must not pull the wallet back to Arc mid-transfer
    await toChain(c);
    const bp = new ethers.BrowserProvider(walletProv(), "any");
    for (let i = 0; i < 8; i++) { if (Number((await bp.getNetwork()).chainId) === c.id) return bp.getSigner(me()); await new Promise((r) => setTimeout(r, 500)); }
    throw new Error(L(`Your wallet is still on another network — switch it to ${c.name} and try again.`, `지갑이 아직 다른 네트워크에 있어요 — ${c.name}(으)로 바꾸고 다시 시도해 주세요.`, `钱包仍在其他网络——请切换到 ${c.name} 后重试。`));
  }
  async function fees(c) {
    try {
      const r = await fetch(`/api/social?cctp=fees&src=${c.d}`);
      const j = r.ok ? await r.json() : null;
      const raw = j && j.fees;
      const list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.data) ? raw.data : [];
      const tiers = list.map((x) => ({ fin: Number(x.finalityThreshold), bps: Number(x.minimumFee || 0), fwd: x.forwardFee ? BigInt(Math.ceil(Number(x.forwardFee.med != null ? x.forwardFee.med : x.forwardFee.high || 0))) : 0n })).filter((x) => x.fin);
      return tiers.length ? tiers : null;
    } catch { return null; }
  }
  // protocol fee (bps of the amount, rounded up) + the forwarding fee; fast when the source offers it
  function plan(amount6) {
    if (!B.fees) return null;
    const fast = B.fees.find((x) => x.fin <= 1000), std = B.fees.find((x) => x.fin >= 2000);
    const t = fast || std;
    if (!t) return null;
    const proto = (amount6 * BigInt(Math.round(t.bps * 100)) + 999999n) / 1000000n;
    const maxFee = proto + t.fwd + (t.fwd / 10n); // 10% headroom on the forwarding fee
    return { fin: t.fin <= 1000 ? 1000 : 2000, fast: t.fin <= 1000, maxFee, get: amount6 > maxFee ? amount6 - maxFee : 0n };
  }
  const six = (s) => { try { return ethers.parseUnits(String(s || "0").trim() || "0", 6); } catch { return 0n; } };
  const fmt6 = (v) => num(Number(ethers.formatUnits(v || 0n, 6)), 2);

  function modal() {
    let m = $("cp5-bridge");
    if (m) return m;
    m = document.createElement("div");
    m.id = "cp5-bridge"; m.className = "cp5-modal"; m.hidden = true;
    m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", "Bring USDC to Arc");
    body.appendChild(m);
    m.addEventListener("click", onClick);
    m.addEventListener("input", (e) => { if (e.target.id === "cp5-br-amt") { B.amt = e.target.value; paintQuote(); } });
    return m;
  }
  function open() {
    const m = modal();
    m.hidden = false; body.classList.add("cp5-modal-open");
    paint();
    if (!B.pending && !B.fees) fees(B.ch).then((f) => { B.fees = f; paint(); });
    if (B.pending) watch();
  }
  function close() { const m = $("cp5-bridge"); if (m) m.hidden = true; body.classList.remove("cp5-modal-open"); if (!B.busy) window.arcChainSwitching = false; }
  function paintQuote() {
    const q = $("cp5-br-q");
    if (!q) return;
    const a6 = six(B.amt), p = plan(a6);
    q.innerHTML = !B.fees ? `<span>${T("Reading Circle's fees…")}</span>` : !p ? `<span>${T("Circle isn't quoting this route right now.")}</span>`
      : a6 === 0n ? `<span>${esc(L("Fee", "수수료", "手续费"))} ≈ <b data-no-i18n>${fmt6(plan(1000000n).maxFee)} USDC</b> · ${T(p.fast ? "fast: usually a few minutes" : "standard: up to about 20 minutes")}</span>`
      : p.get === 0n ? `<span class="bad">${T("That's less than the fee.")}</span>`
      : `<span>${esc(L("Arrives on Arc", "Arc 도착", "到账 Arc"))} ≥ <b data-no-i18n>${fmt6(p.get)} USDC</b></span><span>${esc(L("Fee at most", "수수료 최대", "手续费最多"))} <b data-no-i18n>${fmt6(p.maxFee)} USDC</b> · ${T(p.fast ? "fast: usually a few minutes" : "standard: up to about 20 minutes")}</span>`;
    const go = $("cp5-br-go");
    if (go) go.disabled = B.busy || !p || a6 === 0n || p.get === 0n || (B.bal != null && a6 > B.bal);
  }
  function paint() {
    const m = modal(), u = me();
    const P = B.pending;
    let inner;
    if (P) {
      const c = CH.find((x) => x.d === P.d) || CH[0];
      const steps = [[L(`Sent from ${c.name}`, `${c.name}에서 보냄`, `已从 ${c.name} 发出`), true], [tr("Circle confirms the burn"), P.status === "complete" || !!P.fwd], [tr("Minted on Arc"), !!P.fwd]];
      inner = `<h3>${T("Bringing USDC to Arc")}</h3><p class="cp5-br-sub" data-no-i18n>${fmt6(BigInt(P.amount || 0))} USDC · ${esc(c.name)} → Arc · ${esc(short(P.to))}</p>
        <ol class="cp5-br-steps">${steps.map(([t, ok], i) => `<li class="${ok ? "ok" : steps.slice(0, i).every((x) => x[1]) ? "now" : ""}"><i></i>${esc(t)}</li>`).join("")}</ol>
        <p class="cp5-br-links"><a href="${c.ex}/tx/${esc(P.tx)}" target="_blank" rel="noopener" data-no-i18n>${esc(L(`Burn on ${c.name}`, `${c.name} 소각 내역`, `${c.name} 上的销毁`))} ↗</a>${P.fwd ? ` · <a href="${esc((CONFIG.BLOCK_EXPLORER || "https://arc.etherscan.io") + "/tx/" + P.fwd)}" target="_blank" rel="noopener">${T("Mint on Arc")} ↗</a>` : ""}</p>
        ${P.fwd ? `<button type="button" class="bp-btn-primary bp-btn-block" data-br="use">${T("Contribute it now")}</button><button type="button" class="cp5-br-link" data-br="clear">${T("Done — close")}</button>`
          : `<p class="cp5-br-wait">${T("This page checks every few seconds. You can close it — the transfer finishes on its own and shows here when you come back.")}</p><button type="button" class="cp5-br-link" data-br="clear">${T("Stop watching (the transfer still completes)")}</button>`}`;
    } else {
      inner = `<h3>${T("Bring USDC from another chain")}</h3>
        <p class="cp5-br-sub">${T("Circle's own bridge (CCTP) burns your USDC there and mints the same USDC to your address on Arc. Circle's Forwarding Service does the Arc side, so you don't need Arc gas.")}</p>
        <div class="cp5-br-ch" role="radiogroup" aria-label="From">${CH.map((c) => `<button type="button" role="radio" aria-checked="${c === B.ch}" data-br-ch="${c.id}">${esc(c.name)}</button>`).join("")}</div>
        ${u ? `<label class="cp5-br-in"><span data-no-i18n>${esc(L("Amount", "수량", "数量"))}</span><input id="cp5-br-amt" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(B.amt || "")}"><em>USDC</em></label>
          <p class="cp5-br-bal" data-no-i18n>${B.bal != null ? `${esc(L(`On ${B.ch.name}:`, `${B.ch.name} 잔액:`, `${B.ch.name} 余额:`))} <b>${fmt6(B.bal)} USDC</b> <button type="button" class="cp5-br-max" data-br="max">${esc(L("Max", "최대", "最大"))}</button>` : `<button type="button" class="cp5-br-link" data-br="bal">${esc(L(`Check my USDC on ${B.ch.name}`, `${B.ch.name}의 내 USDC 확인`, `查看我在 ${B.ch.name} 的 USDC`))}</button>`}</p>
          <div class="cp5-br-q" id="cp5-br-q"></div>
          <p class="cp5-br-to" data-no-i18n>${esc(L(`Arrives at ${short(u)} on Arc — the same address you use here. You pay a little ${B.ch.gas} for gas on ${B.ch.name}.`, `Arc의 ${short(u)}(지금 쓰는 주소)로 들어와요. ${B.ch.name} 가스비로 ${B.ch.gas}가 조금 필요해요.`, `到账 Arc 上的 ${short(u)}(就是你现在用的地址)。需要少量 ${B.ch.gas} 支付 ${B.ch.name} 的 gas。`))}</p>
          <button type="button" class="bp-btn-primary bp-btn-block" id="cp5-br-go" data-br="go"${B.busy ? " disabled" : ""}>${B.busy ? T(B.msg || "Confirm in wallet…") : T("Bring it to Arc")}</button>`
        : `<button type="button" class="bp-btn-primary bp-btn-block" data-br="connect">${T("Connect wallet")}</button>`}
        ${B.err ? `<p class="cp5-br-err">${esc(B.err)}</p>` : ""}`;
    }
    m.innerHTML = `<div class="cp5-modal-card"><button type="button" class="cp5-modal-x" data-br="close" aria-label="Close">×</button>${inner}</div>`;
    paintQuote();
  }
  async function onClick(e) {
    if (e.target === e.currentTarget) { close(); return; }
    const chb = e.target.closest("[data-br-ch]");
    if (chb && !B.busy) { B.ch = CH.find((c) => String(c.id) === chb.dataset.brCh) || B.ch; B.bal = null; B.fees = null; B.err = ""; paint(); fees(B.ch).then((f) => { B.fees = f; paintQuote(); }); return; }
    const b = e.target.closest("[data-br]");
    if (!b) return;
    const k = b.dataset.br;
    if (k === "close") return close();
    if (k === "connect") { try { await connectWallet(); } catch { /* the wallet said no */ } paint(); return; }
    if (k === "max" && B.bal != null) { B.amt = ethers.formatUnits(B.bal, 6); paint(); return; }
    if (k === "clear") { B.pending = null; try { localStorage.removeItem(PKEY); } catch { /* fine */ } clearInterval(B.poll); B.poll = null; paint(); return; }
    if (k === "use") {
      const P = B.pending;
      const got = P && P.got ? Number(ethers.formatUnits(BigInt(P.got), 6)) : 0;
      B.pending = null; try { localStorage.removeItem(PKEY); } catch { /* fine */ }
      close();
      const inp = $("bp-contribute-amount");
      if (inp && got > 0) { inp.value = String(Math.floor(got * 100) / 100); inp.dispatchEvent(new Event("input", { bubbles: true })); }
      const btn = $("bp-contribute-btn");
      if (btn) btn.scrollIntoView({ behavior: reduce() ? "auto" : "smooth", block: "center" });
      return;
    }
    if (k === "bal") {
      B.err = "";
      try { const sg = await signerOn(B.ch); B.bal = await new ethers.Contract(B.ch.usdc, ERC20, sg).balanceOf(me()); } catch (err) { B.err = rejected(err) ? tr("You rejected the request in your wallet.") : String(err.shortMessage || err.message || err).slice(0, 160); }
      paint(); return;
    }
    if (k === "go") return send();
  }
  async function send() {
    const c = B.ch, a6 = six(B.amt), p = plan(a6), u = me();
    if (!u || !p || a6 === 0n || p.get === 0n) return;
    B.busy = true; B.err = ""; B.msg = "Switching network…"; paint();
    try {
      const sg = await signerOn(c);
      const usdc = new ethers.Contract(c.usdc, ERC20, sg), tm = new ethers.Contract(TM, TMABI, sg);
      const bal = await usdc.balanceOf(u);
      B.bal = bal;
      if (bal < a6) throw new Error(L(`Not enough USDC on ${c.name}.`, `${c.name}에 USDC가 부족해요.`, `${c.name} 上的 USDC 不足。`));
      if ((await usdc.allowance(u, TM)) < a6) {
        B.msg = "Approve USDC in your wallet…"; paint();
        const ap = await usdc.approve(TM, a6);
        B.msg = "Approving…"; paint();
        await ap.wait();
      }
      B.msg = "Confirm the transfer in your wallet…"; paint();
      const tx = await tm.depositForBurnWithHook(a6, 26, ethers.zeroPadValue(u, 32), c.usdc, ethers.ZeroHash, p.maxFee, p.fin, HOOK);
      B.pending = { d: c.d, tx: tx.hash, amount: a6.toString(), got: p.get.toString(), to: u, at: Date.now(), status: null, fwd: null };
      try { localStorage.setItem(PKEY, JSON.stringify(B.pending)); } catch { /* memory copy */ }
      B.msg = "Sending…"; paint();
      await tx.wait();
      if (typeof cpToast === "function") cpToast(tr("Sent — Circle mints it on Arc in a few minutes."), "ok");
      watch();
    } catch (err) {
      B.err = rejected(err) ? tr("You rejected the request in your wallet.") : String(err.shortMessage || err.reason || err.message || err).slice(0, 180);
    } finally { B.busy = false; window.arcChainSwitching = false; paint(); }
  }
  function watch() {
    if (B.poll || !B.pending) return;
    const tick = async () => {
      const P = B.pending;
      if (!P) { clearInterval(B.poll); B.poll = null; return; }
      try {
        const r = await fetch(`/api/social?cctp=msg&src=${P.d}&tx=${P.tx}`, { cache: "no-store" });
        const j = r.ok ? await r.json() : null;
        const m = j && j.messages && j.messages[0];
        if (m) {
          P.status = m.status || P.status;
          if (m.forwardTxHash) { P.fwd = m.forwardTxHash; if (m.decoded && m.decoded.amount) { try { const fee = BigInt(m.decoded.feeExecuted || 0); P.got = (BigInt(m.decoded.amount) - fee).toString(); } catch { /* keep the estimate */ } } }
          try { localStorage.setItem(PKEY, JSON.stringify(P)); } catch { /* fine */ }
          if (P.fwd) { clearInterval(B.poll); B.poll = null; if (typeof window.arcFeedback === "function") window.arcFeedback("milestone"); if (typeof cpToast === "function") cpToast(tr("Your USDC is on Arc."), "ok"); }
        }
      } catch { /* next tick */ }
      if (!$("cp5-bridge") || !$("cp5-bridge").hidden) paint();
      paintChip();
    };
    B.poll = setInterval(tick, 6000);
    tick();
  }
  // the entry under the contribute button, and a chip while a transfer is on its way
  function paintChip() {
    const side = $("bp-round-panel");
    if (!side) return;
    let row = side.querySelector(".cp5-br-entry");
    const s = S();
    const show = !s || !s.started || (s.isOpen && nowS() < Number(s.deadline));
    if (!show && !B.pending) { if (row) row.remove(); return; }
    if (!row) {
      row = document.createElement("div"); row.className = "cp5-br-entry";
      const after = $("bp-contribute-btn");
      if (after && after.parentNode === side) after.insertAdjacentElement("afterend", row); else side.appendChild(row);
      row.addEventListener("click", (e) => { if (e.target.closest("button")) open(); });
    }
    const P = B.pending;
    row.innerHTML = P ? `<button type="button" class="cp5-br-chip${P.fwd ? " ok" : ""}" data-no-i18n><i></i>${esc(P.fwd ? L("USDC arrived on Arc · contribute it", "USDC가 Arc에 도착했어요 · 참여하기", "USDC 已到账 Arc · 去参与") : L("USDC on its way to Arc…", "USDC가 Arc로 오는 중…", "USDC 正在转入 Arc…"))}</button>`
      : `<button type="button" class="cp5-br-open"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h12M12 6l6 6-6 6"/><circle cx="4" cy="12" r="1.6"/></svg>${T("Bring USDC from another chain")}</button>`;
  }
  setTimeout(() => { paintChip(); if (B.pending && !B.pending.fwd) watch(); }, 1200);
  setInterval(() => { if (!document.hidden) paintChip(); }, 15000);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("cp5-bridge") && !$("cp5-bridge").hidden) close(); });
  window.cpBridge = { open };
  document.addEventListener("arc:lang", () => { try { paintBox(); sideStatus(); route(); results(); keys(); paintChip(); if ($("cp5-bridge") && !$("cp5-bridge").hidden) paint(); } catch { /* next paint */ } });
})();
