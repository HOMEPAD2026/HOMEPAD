/* global ethers, state, connectWallet, ensureArcForWrite */
// arc-launchdrop.js — Launch Drop on the ARCIRCLE Staking page (arcpad.html#staking; api/_launchdrop.mjs):
// stake $ARCIRCLE, get a piece of every new ArcPad coin. Every launch sends 8% of the coin's supply to the platform
// treasury; half of it goes to veARCIRCLE stakers, pro rata to their veARCIRCLE when the week ends, straight to their
// wallets through the Multisender.
//   · this week: the coins launched so far, the snapshot countdown, your share if you stake
//   · past weeks: each coin, sent or still sending, and what your wallet got
//   · the treasury's console (only for the treasury wallet, or #staking?drop=console): approve once per coin, then
//     one Multisender send per chunk of wallets; every send is checked by the server against the week's plan
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-staking");
  const host = document.getElementById("ld-body");
  if (!panel || !host) return;
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T0 = (s) => esc(tr(s));
  // short labels translated here (a one-word key in the site-wide dictionary would change other pages)
  const WK = { You: ["나", "我"], Sent: ["전송 완료", "已发送"], Sending: ["전송 중", "发送中"], stakers: ["명 스테이커", "位质押者"], wallets: ["개 지갑", "个钱包"], transaction: ["트랜잭션", "笔交易"], transactions: ["트랜잭션", "笔交易"], "Week of": ["주간", "当周"], "week of": ["주간", "当周"] };
  const T = (s) => { const l = (window.arcI18n && window.arcI18n.get()) || "en", r = WK[s]; return r && l === "ko" ? esc(r[0]) : r && l === "zh" ? esc(r[1]) : T0(s); };
  const lc = (a) => String(a || "").toLowerCase();
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const E18 = 10n ** 18n;
  const tok = (raw) => { try { const n = Number(BigInt(raw || "0") / 10n ** 14n) / 1e4; return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.0+$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }); } catch { return "—"; } };
  const day = (t) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const left = (s) => { s = Math.max(0, Math.floor(s)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
  const coinLink = (c) => `<a class="ld-coin" href="/arc#coin/${esc(c.token)}" data-no-i18n>$${esc(c.sym)}</a>`;
  const wk = (ws, low) => { const l = (window.arcI18n && window.arcI18n.get()) || "en", d = day(ws); return esc(l === "ko" ? `${d} 주` : l === "zh" ? `${d} 当周` : `${low ? "week" : "Week"} of ${d}`); };
  const S = { d: null, acct: "", con: null, busy: "", msg: "", timer: 0, clock: 0 };
  const consoleWanted = () => /[?&]drop=console\b/.test(location.hash);

  async function load() {
    try {
      const r = await fetch(`/api/desk?stake=drop${me() ? `&u=${me()}` : ""}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && j.v) S.d = j;
    } catch { /* keep the last read */ }
    if (S.d && (consoleWanted() || (me() && S.d.treasury && me() === lc(S.d.treasury)))) {
      try { const r = await fetch(`/api/desk?stake=dropconsole`, { cache: "no-store" }); S.con = r.ok ? await r.json() : null; } catch { /* later */ }
    } else S.con = null;
    paint();
  }

  function weekHtml(d) {
    const w = d.week, coins = w.coins || [];
    const mine = d.me && Number(d.me.share) > 0
      ? `<div class="ld-me"><span>${T("Your share now")}</span><b>${(d.me.share * 100).toFixed(2)}%</b><small>≈ ${tok(d.me.perCoin)} ${T("of every coin")}</small></div>`
      : `<div class="ld-me none"><span>${T(me() ? "You're not staking yet" : "Connect to see your share")}</span><button type="button" class="ld-btn pri" data-ld="${me() ? "lock" : "connect"}">${T(me() ? "Lock $ARCIRCLE" : "Connect wallet")}</button></div>`;
    return `<div class="ld-week">
      <div class="ld-wk-h"><span class="ld-k">${T(d.started ? "This week's drop" : "First drop")}</span><b data-ld-end="${w.ends}">${left(w.ends - Date.now() / 1000)}</b><small>${T("until the snapshot")} · ${day(w.ends)}</small></div>
      <div class="ld-coins">${coins.length ? coins.map(coinLink).join("") : `<span class="ld-none">${T(d.started ? "No coins launched this week yet — every new one joins this drop." : "Coins launched from Oct 8 join the first drop.")}</span>`}</div>
      ${mine}
    </div>`;
  }
  function pastHtml(d) {
    if (!d.past || !d.past.length) return "";
    return `<div class="ld-past"><h4>${T("Past drops")}</h4>${d.past.map((w) => `<div class="ld-pw"><div class="ld-pw-h"><b>${wk(w.ws)}</b><small>${esc(w.stakers)} ${T("stakers")} · ${tok(w.per)} ${T("of each coin")}</small></div>
      ${w.coins.length ? `<ul>${w.coins.map((c) => `<li>${coinLink(c)}<span class="ld-st ${c.done ? "ok" : c.skipped ? "bad" : "mid"}">${c.skipped ? T("Kept — no stakers") : c.done ? T("Sent") : `${T("Sending")} ${esc(c.sent)}/${esc(c.of)}`}</span>${c.mine ? `<span class="ld-mine ${c.mine.sent ? "ok" : ""}">${T("You")}: ${tok(c.mine.amount)} ${c.mine.sent ? "✓" : ""}</span>` : ""}</li>`).join("")}</ul>` : `<p class="ld-none">${T("No coins launched that week.")}</p>`}</div>`).join("")}</div>`;
  }
  function consoleHtml() {
    const c = S.con;
    if (!c) return "";
    const isTr = me() && c.treasury && me() === lc(c.treasury);
    const rows = (c.todo || []).map((x, i) => `<div class="ld-ct"><div><b data-no-i18n>$${esc(x.sym)}</b> <small>${wk(x.ws, true)} · ${esc(x.wallets)} ${T("wallets")} · ${tok(x.total)}</small></div>
      <button type="button" class="ld-btn pri" data-ld="send" data-i="${i}"${!isTr || S.busy ? " disabled" : ""}>${S.busy === String(i) ? T("Sending…") : `${T("Send")} (${x.chunks.length} ${T(x.chunks.length === 1 ? "transaction" : "transactions")})`}</button></div>`).join("");
    return `<div class="ld-console"><h4>${T("Treasury console")}</h4>
      <p>${isTr ? T("Each coin: one approval, then one Multisender transaction per 200 wallets. Every send is checked against the week's plan.") : `${T("Connect the treasury wallet to send")}: <code data-no-i18n>${esc(c.treasury || "—")}</code>`}</p>
      ${rows || `<p class="ld-none">${T("Nothing to send.")}</p>`}${S.msg ? `<div class="ld-msg" role="status">${esc(S.msg)}</div>` : ""}</div>`;
  }
  function paint() {
    const d = S.d;
    if (!d) { host.innerHTML = ""; return; }
    host.innerHTML = `<section class="ams-card ld-card">
      <div class="ld-top"><span class="ld-badge">${T("New")}</span><h3>${T("Launch Drop")}</h3></div>
      <p class="ld-lede">${T("Stake $ARCIRCLE, get a piece of every new coin. Every ArcPad launch sends 8% of the coin to the treasury — half of it, 40M of every coin, goes to veARCIRCLE stakers, split by veARCIRCLE at the end of each week and sent straight to their wallets.")}</p>
      ${weekHtml(d)}${pastHtml(d)}${consoleHtml()}
    </section>`;
  }

  async function send(i) {
    const x = S.con && S.con.todo[i];
    if (!x || S.busy) return;
    S.busy = String(i); S.msg = ""; paint();
    try {
      if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
      const signer = state.signer;
      const erc = new ethers.Contract(x.token, ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"], signer);
      const ms = new ethers.Contract(S.con.multisend, ["function send(address token, address[] to, uint256[] amounts) returns (uint256)"], signer);
      const total = BigInt(x.total);
      const bal = await erc.balanceOf(me());
      if (bal < total) throw new Error(`${tr("The treasury holds")} ${tok(bal.toString())} $${x.sym}, ${tr("the drop needs")} ${tok(x.total)}.`);
      if ((await erc.allowance(me(), S.con.multisend)) < total) { S.msg = tr("Approve in your wallet…"); paint(); await (await erc.approve(S.con.multisend, total)).wait(); }
      for (let k = 0; k < x.chunks.length; k++) {
        const ch = x.chunks[k];
        S.msg = `${tr("Confirm send")} ${k + 1}/${x.chunks.length}…`; paint();
        const tx = await ms.send(x.token, ch.map((r) => r[0]), ch.map((r) => BigInt(r[1])));
        await tx.wait();
        const r = await fetch("/api/desk", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "launch-drop-sent", ws: x.ws, tx: tx.hash }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      }
      S.msg = `$${x.sym}: ${tr("sent to every staker.")}`;
    } catch (e) { S.msg = String((e && (e.shortMessage || e.reason || e.message)) || e).slice(0, 200); }
    S.busy = ""; await load();
  }

  host.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-ld]");
    if (!b || b.disabled) return;
    const k = b.dataset.ld;
    if (k === "connect") { if (typeof connectWallet === "function") connectWallet(); return; }
    if (k === "lock") { const c = panel.querySelector(".stk-lock"); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (k === "send") send(Number(b.dataset.i));
  });
  function tick() {
    if (document.hidden || !panel.classList.contains("active")) return;
    if (me() !== S.acct) { S.acct = me(); load(); return; }
    host.querySelectorAll("[data-ld-end]").forEach((el) => { el.textContent = left(Number(el.dataset.ldEnd) - Date.now() / 1000); });
  }
  function show() {
    S.acct = me(); load();
    clearInterval(S.timer); S.timer = setInterval(() => { if (!document.hidden && panel.classList.contains("active") && !S.busy) load(); }, 60000);
    clearInterval(S.clock); S.clock = setInterval(tick, 1000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "staking") show(); else { clearInterval(S.timer); clearInterval(S.clock); } });
  document.addEventListener("arc:lang", () => paint());
  if (panel.classList.contains("active")) show();
  window.arcLaunchDrop = { state: S, load };
})();
