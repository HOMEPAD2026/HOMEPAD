/* global CONFIG */
// arc-lab.js — ARCIA LAB (arcpad.html#lab): ARCIA reads what the internet is talking about, turns it into an original
// meme coin, launches it on ArcPad by herself and runs it in public. Read-only page over /api/arcia402?lab=board
// (api/_lab.mjs); the only write is a tip (a TikTok / Instagram / X / YouTube / Reddit link for her to read).
//   · status     live / dry run / paused, the next launch slot, the Lab wallet, where the fees went
//   · her coins  every coin she launched: its story, market cap against the opening one, the locked dev buy, the scan
//   · today      the signals she read, her three concepts and which one passed the rules (and why the others didn't)
//   · the rules  fixed in code, shown with today's numbers
//   · send a trend · the log (every action, with its transaction)
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-lab");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  // short labels translated here (a generic one-word key in the site-wide dictionary would change other pages)
  const WK = { Mode: ["모드", "模式"], launched: ["런칭", "发射于"], signals: ["개 신호", "条信号"], "this week": ["이번 주", "本周"], Plan: ["기획", "计划"], Update: ["업데이트", "更新"], Funds: ["잔액", "资金"], Error: ["오류", "错误"], Switch: ["스위치", "开关"], Asked: ["승인 요청", "已请求"], Skipped: ["건너뜀", "已跳过"] };
  const W = (en) => { const l = (window.arcI18n && window.arcI18n.get()) || "en", r = WK[en]; return r && l === "ko" ? esc(r[0]) : r && l === "zh" ? esc(r[1]) : T(en); };
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const EXPL = (kind, x) => `${(typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arcscan.app"}/${kind}/${x}`;
  const usd = (v) => (v == null || !isFinite(v) ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + Number(v).toFixed(v < 10 ? 2 : 0));
  const day = (t) => (t ? new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");
  const ago = (t) => { const s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? tr("just now") : s < 5400 ? `${Math.round(s / 60)}m` : s < 129600 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };
  const left = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
  const OPEN_MCAP = 4350; // every ArcPad coin opens near this market cap
  const S = { b: null, at: 0, booted: false, timer: 0, clock: 0, tipMsg: "", busy: false };

  const KIND = { ask: "Asked", ok: "OK", skip: "Skipped", launch: "Launch", lock: "Lock", fees: "Fees", burn: "Burn", plan: "Plan", dry: "Dry run", digest: "Update", post: "Post", funds: "Funds", error: "Error", pause: "Switch", tx: "Tx" };
  const ICON = {
    flask: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6L4.8 18.2A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.8L14 9V3"/><path d="M7.5 15h9"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    fire: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.7 1.3 2.6 2.3 3C11 9 11.5 6 12 3z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12.2l2.3 2.3 4.2-4.6"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>',
  };

  async function load(force) {
    if (!force && S.b && Date.now() - S.at < 20000) return;
    try {
      const r = await fetch("/api/arcia402?lab=board", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && j.v) { S.b = j; S.at = Date.now(); }
    } catch { /* keep the last read */ }
    paint();
  }

  function statusHtml(b) {
    const mode = b.mode === "live" ? ["live", "Live — she plans, the team OKs each launch"] : b.mode === "off" ? ["off", "Paused"] : ["dry", "Dry run — she plans in public, nothing is sent yet"];
    const nx = b.next ? `<span class="lb-st-k">${T("Next launch slot")}</span><b data-lb-next="${b.next}">${left(b.next - Date.now() / 1000)}</b>` : `<span class="lb-st-k">${T("Next launch slot")}</span><b>—</b>`;
    const f = b.fees || {};
    return `<div class="lb-status">
      <div class="lb-st lb-mode ${mode[0]}"><i></i><div><span class="lb-st-k">${W("Mode")}</span><b>${T(mode[1])}</b></div></div>
      <div class="lb-st"><div>${nx}<small>${esc(b.perDay)} ${T(b.perDay === 1 ? "launch a day" : "launches a day")}</small></div></div>
      <div class="lb-st"><div><span class="lb-st-k">${T("Lab wallet")}</span><b>${b.wallet ? `<a href="${EXPL("address", b.wallet.address)}" target="_blank" rel="noopener" data-no-i18n>${short(b.wallet.address)}</a>` : "—"}</b><small>${b.wallet && b.wallet.usdc != null ? `${b.wallet.usdc.toFixed(2)} USDC` : T("not set yet")}</small></div></div>
      <div class="lb-st"><div><span class="lb-st-k">${T("Fees to the $ARCIRCLE burn")}</span><b>${(Number(f.sentToBurn || 0) / 1e6).toFixed(2)} USDC</b><small>${T("of")} ${(Number(f.usdcIn || 0) / 1e6).toFixed(2)} USDC ${T("earned")} · ${esc(f.tokensBurned || 0)} ${T("coin-fee burns")}</small></div></div>
    </div>`;
  }

  function coinCard(c) {
    const m = c.stats && c.stats.mcap, ch = m ? ((m / OPEN_MCAP - 1) * 100) : null;
    const sc = c.scan ? `<span class="lb-chip ${c.scan.critical ? "bad" : c.scan.score >= 60 ? "ok" : "mid"}">${ICON.shield}${T("Scan")} ${esc(c.scan.score)}</span>` : `<span class="lb-chip">${ICON.shield}${T("Scan soon")}</span>`;
    const lk = c.locked && c.locked.unlockAt ? `<span class="lb-chip ok">${ICON.lock}${T("Dev buy locked till")} ${day(c.locked.unlockAt)}</span>` : c.devBuy ? `<span class="lb-chip mid">${ICON.lock}${T("Locking…")}</span>` : "";
    const sig = (c.signals || []).slice(0, 2).map((s) => `<li><em>${esc(s.src)}</em>${esc(s.text)}</li>`).join("");
    return `<article class="lb-coin">
      <a class="lb-coin-img" href="/arc#coin/${esc(c.token)}"><img src="${esc(c.image)}" alt="" loading="lazy" width="96" height="96"></a>
      <div class="lb-coin-main">
        <div class="lb-coin-h"><a href="/arc#coin/${esc(c.token)}" data-no-i18n><b>$${esc(c.symbol)}</b> ${esc(c.name)}</a><small>${W("launched")} ${ago(c.launchedAt)} ${T("ago")}</small></div>
        <p data-no-i18n>${esc(c.story)}</p>
        <div class="lb-coin-n"><span><small>${T("Market cap")}</small><b>${usd(m)}</b>${ch != null ? `<i class="${ch >= 0 ? "up" : "dn"}">${ch >= 0 ? "+" : ""}${ch.toFixed(0)}% ${T("since open")}</i>` : ""}</span>${sc}${lk}</div>
        ${sig ? `<details class="lb-why"><summary>${T("Why this coin")}</summary><p data-no-i18n>${esc(c.why || "")}</p><ul data-no-i18n>${sig}</ul></details>` : ""}
        <div class="lb-coin-a"><a class="lb-btn pri" href="/arc#coin/${esc(c.token)}">${T("Open coin")}</a><a class="lb-btn" href="/arc#scanner?t=${esc(c.token)}">${T("Scan it")}</a><a class="lb-btn ghost" href="${EXPL("tx", c.tx)}" target="_blank" rel="noopener">${T("Launch tx")} ↗</a></div>
      </div>
    </article>`;
  }

  function planHtml(b) {
    const p = b.plan;
    if (!p) return `<p class="lb-empty">${T("Her first plan appears about 90 minutes before the next launch slot.")}</p>`;
    const sigs = p.signals || [];
    const cards = (p.concepts || []).map((c) => {
      const picked = c.symbol === p.pick, bad = !!c.problem;
      return `<div class="lb-concept ${picked ? "pick" : ""} ${bad ? "out" : ""}">
        ${c.image ? `<img src="${esc(c.image)}" alt="" width="64" height="64" loading="lazy">` : `<span class="lb-c-ph">${ICON.flask}</span>`}
        <div><div class="lb-c-h" data-no-i18n><b>$${esc(c.symbol)}</b> ${esc(c.name)}<span class="lb-c-s">${esc(c.score)}</span></div>
        <p data-no-i18n>${esc(c.story)}</p>
        ${bad ? `<div class="lb-c-why bad">${T("Didn't pass")}: <span data-no-i18n>${esc(c.problem)}</span></div>` : picked ? `<div class="lb-c-why ${p.rejected || p.expired ? "bad" : "ok"}">${T(p.rejected ? "Picked — the team passed on it" : p.expired ? "Picked — no OK in 12 hours, skipped" : p.used ? "Launched" : p.approved ? "OK'd — launching" : p.asked ? "Picked — waiting for the team's OK" : p.dry ? "Picked — would launch (dry run)" : "Picked for the next slot")}</div>` : `<div class="lb-c-why">${T("Passed, not picked")}</div>`}</div>
      </div>`;
    }).join("");
    const list = sigs.slice(0, 14).map((s) => `<li><em data-no-i18n>${esc(s.src)}</em><span data-no-i18n>${esc(s.text)}</span>${s.meta ? `<small data-no-i18n>${esc(s.meta)}</small>` : ""}</li>`).join("");
    return `<div class="lb-plan-h"><span>${T("Planned")} ${ago(p.at)} ${T("ago")} · ${esc(sigs.length)} ${W("signals")}</span></div>
      <div class="lb-concepts">${cards || `<p class="lb-empty">${T("No concept passed the rules this time — nothing launches in this slot.")}</p>`}</div>
      ${list ? `<details class="lb-sigs"><summary>${T("What she read")} (${esc(sigs.length)})</summary><ul>${list}</ul></details>` : ""}`;
  }

  function rulesHtml(b) {
    const r = b.rules || {};
    const rows = [
      [ICON.eye, "Original only", "No coin is named after, pictures or hints at a real person, a brand or anyone else's character. A viral post is only a spark — the coin never uses the name. Every concept passes a word filter and a second, independent review."],
      [ICON.send, "A person OKs every launch", "ARCIA does the reading, the concepts, the art, the posts and the fees by herself. The one step that spends money — the launch — waits for the team's tap on Telegram. No OK in 12 hours and the concept is skipped."],
      [ICON.lock, `Dev buy ${r.devBuy || 0} USDC, locked ${r.lockDays || 30} days`, "Her only buy is the dev buy at launch, and it goes straight into ArcLock. She can't sell it before the date — nobody can."],
      [ICON.fire, "Fees, by a fixed rule", `Fees in her own coin are burned (sent to 0x…dEaD), never sold. ${((r.burnBps || 0) / 100).toFixed(0)}% of her USDC fees go to the $ARCIRCLE fee burn; the rest pays for her next launches.`],
      [ICON.shield, "No hype, no trading", `She never trades her coins and never promises a price. A ${((r.feeBps || 0) / 100).toFixed(1)}% creator fee on each coin, at most ${esc(b.perDay)} launch${b.perDay === 1 ? "" : "es"} a day, and the team can pause her at any time.`],
    ];
    return `<div class="lb-rules">${rows.map(([i, h, p]) => `<div class="lb-rule"><span class="lb-ri">${i}</span><div><b>${T(h)}</b><p>${T(p)}</p></div></div>`).join("")}</div>`;
  }

  function logHtml(b) {
    const rows = (b.log || []).slice(0, 25).map((l) => `<li class="k-${esc(l.kind)}"><span class="lb-l-k">${W(KIND[l.kind] || l.kind)}</span><span class="lb-l-t" data-no-i18n>${esc(l.text)}</span><span class="lb-l-w">${ago(l.t)}${l.tx ? ` · <a href="${EXPL("tx", l.tx)}" target="_blank" rel="noopener">tx ↗</a>` : ""}</span></li>`).join("");
    return rows ? `<ol class="lb-log">${rows}</ol>` : `<p class="lb-empty">${T("Nothing yet.")}</p>`;
  }

  function tipHtml() {
    return `<form class="lb-tip" id="lb-tip" autocomplete="off">
      <p>${T("Seen something funny on TikTok, Instagram, X, YouTube or Reddit? Send her the link — she reads the tips with the rest of the day's signals.")}</p>
      <div class="lb-tip-row"><input id="lb-tip-url" type="url" inputmode="url" placeholder="https://www.tiktok.com/@…/video/…" required maxlength="300"><input id="lb-tip-note" type="text" maxlength="160" placeholder="${T("What's funny about it? (optional)")}"><button class="lb-btn pri" type="submit"${S.busy ? " disabled" : ""}>${ICON.send}${T("Send")}</button></div>
      <div class="lb-tip-msg" role="status">${esc(S.tipMsg)}</div>
    </form>`;
  }

  function paint() {
    const body = $("lb-body"); if (!body) return;
    const b = S.b;
    if (!b) { body.innerHTML = `<div class="lb-skel"><i></i><i></i><i></i></div>`; return; }
    const coins = (b.coins || []).map(coinCard).join("");
    const keep = { u: $("lb-tip-url") ? $("lb-tip-url").value : "", n: $("lb-tip-note") ? $("lb-tip-note").value : "", f: document.activeElement && document.activeElement.id };
    body.innerHTML = `${statusHtml(b)}
      <section class="ams-card lb-sec" id="lb-s-coins"><h2>${ICON.flask}${T("Her coins")}<small>${esc((b.coins || []).length)}</small></h2>${coins ? `<div class="lb-coins">${coins}</div>` : `<p class="lb-empty">${T(b.mode === "live" ? "Her first coin launches at the next slot." : "No coins yet — she's in a dry run: she plans in public and launches once her wallet is switched on.")}</p>`}</section>
      <section class="ams-card lb-sec" id="lb-s-plan"><h2>${ICON.eye}${T("Today's plan")}</h2>${planHtml(b)}</section>
      <section class="ams-card lb-sec" id="lb-s-rules"><h2>${ICON.shield}${T("The rules")}</h2>${rulesHtml(b)}</section>
      <section class="ams-card lb-sec" id="lb-s-tip"><h2>${ICON.send}${T("Send her a trend")}${b.tips ? `<small>${esc(b.tips)} ${W("this week")}</small>` : ""}</h2>${tipHtml()}</section>
      <section class="ams-card lb-sec" id="lb-s-log"><h2>${ICON.fire}${T("Everything she did")}</h2>${logHtml(b)}</section>`;
    const f = $("lb-tip");
    if (f) f.addEventListener("submit", sendTip);
    if (keep.u) $("lb-tip-url").value = keep.u;
    if (keep.n) $("lb-tip-note").value = keep.n;
    if (keep.f === "lb-tip-url" || keep.f === "lb-tip-note") $(keep.f).focus();
  }

  async function sendTip(e) {
    e.preventDefault();
    const url = ($("lb-tip-url").value || "").trim(), note = ($("lb-tip-note").value || "").trim();
    S.busy = true; S.tipMsg = tr("Sending…"); const m = panel.querySelector(".lb-tip-msg"); if (m) m.textContent = S.tipMsg;
    try {
      const r = await fetch("/api/arcia402?lab=tip", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, note }) });
      const j = await r.json().catch(() => ({}));
      S.tipMsg = r.ok ? tr("Thanks — she'll read it with the next plan.") : (j.error || tr("Couldn't send that — try again."));
      if (r.ok) { $("lb-tip-url").value = ""; $("lb-tip-note").value = ""; }
    } catch { S.tipMsg = tr("Couldn't send that — try again."); }
    S.busy = false;
    const m2 = panel.querySelector(".lb-tip-msg"); if (m2) m2.textContent = S.tipMsg;
  }

  function clockTick() {
    if (document.hidden || !panel.classList.contains("active")) return;
    panel.querySelectorAll("[data-lb-next]").forEach((el) => { el.textContent = left(Number(el.dataset.lbNext) - Date.now() / 1000); });
  }
  function show() {
    if (!S.booted) { S.booted = true; paint(); }
    load(false);
    clearInterval(S.timer); S.timer = setInterval(() => { if (!document.hidden && panel.classList.contains("active")) load(true); }, 45000);
    clearInterval(S.clock); S.clock = setInterval(clockTick, 1000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "lab") show(); else { clearInterval(S.timer); clearInterval(S.clock); } });
  document.addEventListener("arc:lang", () => { if (S.booted) paint(); });
  if (panel.classList.contains("active")) show();
  window.arcLab = { state: S, load, paint };
})();
