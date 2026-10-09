/* global ethers, state, connectWallet, ensureArcForWrite, CONFIG */
// arc-launchdrop.js — Launch Drop on the ARCIRCLE Staking page (arcpad.html#staking; api/_launchdrop.mjs):
// stake $ARCIRCLE, get a piece of every new ArcPad coin. Every launch sends 8% of the coin's supply to the platform
// treasury; half of it goes to veARCIRCLE stakers, pro rata to their veARCIRCLE when the week ends, straight to their
// wallets through the Multisender.
//   · this week: the coins launched so far, the snapshot countdown, your share if you stake
//   · past weeks: each coin, sent or still sending, and what your wallet got
//   · the treasury's console (only for the treasury wallet, or #staking?drop=console): approve once per coin, then
//     one Multisender send per chunk of wallets; every send is checked by the server against the week's plan
// With the vault (contracts/ArcLaunchDrop.sol; the API says mode "vault") all of that is the contract's job:
//   · 4% of every coin, snapshot at the start of the week it launched (Thursday 00:00 UTC), pro rata by veARCIRCLE
//   · your drops: everything you can claim, in one "Claim all" (claim(tokens[]))
//   · every drop: deposited / claimed, and "Send to every holder" — anyone can push (pushTo, 100 wallets a transaction)
//   · the treasury console: one deposit per coin (approve + deposit)
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-staking");
  const host = document.getElementById("ld-body");
  if (!panel || !host) return;
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T0 = (s) => esc(tr(s));
  // short labels translated here (a one-word key in the site-wide dictionary would change other pages)
  const WK = { "Ready to claim": ["수령 가능", "可领取"], Claimed: ["수령 완료", "已领取"], Waiting: ["대기 중", "等待中"], You: ["나", "我"], Sent: ["전송 완료", "已发送"], Sending: ["전송 중", "发送中"], stakers: ["명 스테이커", "位质押者"], wallets: ["개 지갑", "个钱包"], transaction: ["트랜잭션", "笔交易"], transactions: ["트랜잭션", "笔交易"], "Week of": ["주간", "当周"], "week of": ["주간", "当周"] };
  const T = (s) => { const l = (window.arcI18n && window.arcI18n.get()) || "en", r = WK[s]; return r && l === "ko" ? esc(r[0]) : r && l === "zh" ? esc(r[1]) : T0(s); };
  const lc = (a) => String(a || "").toLowerCase();
  const me = () => (typeof state !== "undefined" && state && state.account ? lc(state.account) : "");
  const E18 = 10n ** 18n;
  const tok = (raw) => { try { const n = Number(BigInt(raw || "0") / 10n ** 14n) / 1e4; return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.0+$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }); } catch { return "—"; } };
  const day = (t) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const left = (s) => { s = Math.max(0, Math.floor(s)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
  const coinLink = (c) => `<a class="ld-coin" href="/arc#coin/${esc(c.token)}" data-no-i18n>$${esc(c.sym)}</a>`;
  const wk = (ws, low) => { const l = (window.arcI18n && window.arcI18n.get()) || "en", d = day(ws); return esc(l === "ko" ? `${d} 주` : l === "zh" ? `${d} 当周` : `${low ? "week" : "Week"} of ${d}`); };
  const S = { d: null, acct: "", con: null, busy: "", msg: "", timer: 0, clock: 0, rh: null };
  const RHC = (typeof CONFIG !== "undefined" && CONFIG.ARCPAD_RH) || {};
  const rhLive = () => /^0x[0-9a-fA-F]{40}$/.test(String(RHC.FACTORY || "")) && /^0x[0-9a-fA-F]{40}$/.test(String(RHC.DROP || ""));
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
    S.rh = null;
    if (rhLive()) {
      try { const r = await fetch(`/api/desk?stake=droprh${me() ? `&u=${me()}` : ""}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; S.rh = j && j.live ? j : null; } catch { /* later */ }
    }
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

  // ---------------- the vault ----------------
  const VAULT_ABI = ["function claim(address[] list) returns (uint256)", "function pushTo(address token, address[] holders) returns (uint256)", "function deposit(address token, uint256 amount)"];
  const pct = (a, b) => { try { const B = BigInt(b || "0"); return B > 0n ? Number((BigInt(a || "0") * 1000n) / B) / 10 : 0; } catch { return 0; } };
  const explorer = () => ((typeof CONFIG !== "undefined" && CONFIG && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io").replace(/\/$/, "");
  function vMeHtml(d) {
    const m = d.me;
    if (!me()) return `<div class="ld-me none"><span>${T("Connect to see your share")}</span><button type="button" class="ld-btn pri" data-ld="connect">${T("Connect wallet")}</button></div>`;
    if (m && Number(m.share) > 0) return `<div class="ld-me"><span>${T("Your share this week")}</span><b>${(m.share * 100).toFixed(2)}%</b><small>≈ ${tok(m.perCoin)} ${T("of every coin")}</small></div>`;
    if (m && Number(m.shareNext) > 0) return `<div class="ld-me"><span>${T("From next week's coins")}</span><b>${(m.shareNext * 100).toFixed(2)}%</b><small>${T("This week's snapshot was taken before your lock")}</small></div>`;
    return `<div class="ld-me none"><span>${T("You're not staking yet")}</span><button type="button" class="ld-btn pri" data-ld="lock">${T("Lock $ARCIRCLE")}</button></div>`;
  }
  function vWeekHtml(d) {
    const w = d.week, coins = w.coins || [];
    return `<div class="ld-week">
      <div class="ld-wk-h"><span class="ld-k">${T("Next snapshot")}</span><b data-ld-end="${w.ends}">${left(w.ends - Date.now() / 1000)}</b><small>${T("Thursday 00:00 UTC")} · ${day(w.ends)}</small></div>
      <div class="ld-coins"><span class="ld-k">${T("Launched this week")}</span>${coins.length ? coins.map(coinLink).join("") : `<span class="ld-none">${T(d.started ? "No coins yet this week — every new one is shared with this week's holders." : "Coins launched from Oct 8 are shared.")}</span>`}</div>
      ${vMeHtml(d)}
    </div>`;
  }
  function vMineHtml(d) {
    if (!me()) return "";
    const rows = (d.drops || []).filter((x) => x.mine && (BigInt(x.mine.claimable) > 0n || BigInt(x.mine.paid) > 0n));
    if (!rows.length) return "";
    const n = (d.claimable || []).length;
    return `<div class="ld-mine-box"><div class="ld-mb-h"><h4>${T("Your drops")}</h4>${n ? `<button type="button" class="ld-btn pri" data-ld="claim"${S.busy ? " disabled" : ""}>${S.busy === "claim" ? T("Claiming…") : `${T("Claim all")} (${n})`}</button>` : ""}</div>
      <ul class="ld-list">${rows.map((x) => { const c = BigInt(x.mine.claimable) > 0n; return `<li>${coinLink(x)}<span class="ld-amt">${tok(c ? x.mine.claimable : x.mine.paid)}</span><span class="ld-st ${c ? "mid" : "ok"}">${T(c ? "Ready to claim" : "Claimed")}</span></li>`; }).join("")}</ul></div>`;
  }
  function vAllHtml(d) {
    const drops = d.drops || [], wait = d.waiting || [];
    if (!drops.length && !wait.length) return "";
    // rounding leaves a few wei behind once everyone is paid: under 1e-7 of the drop counts as done
    const row = (x) => { const A = BigInt(x.amount), open = (A - BigInt(x.claimed)) * 10000000n > A, p = open ? Math.min(pct(x.claimed, x.amount), 99.9) : 100; return `<li>${coinLink(x)}<small>${wk(x.ws, true)} · ${tok(x.amount)}</small><span class="ld-bar" title="${p}%"><i style="width:${Math.min(100, p)}%"></i></span><span class="ld-st ${open ? "mid" : "ok"}">${p}% ${T("claimed")}</span>${open ? `<button type="button" class="ld-btn" data-ld="push" data-t="${esc(x.token)}"${S.busy ? " disabled" : ""}>${S.busy === "push:" + x.token ? T("Sending…") : T("Send to every holder")}</button>` : ""}</li>`; };
    const wrow = (x) => `<li>${coinLink(x)}<small>${wk(x.ws, true)}</small><span class="ld-st ${x.blocked ? "bad" : "mid"}">${T(x.blocked ? "Kept — no veARCIRCLE at the snapshot" : "Waiting for the treasury's deposit")}</span></li>`;
    return `<div class="ld-past"><h4>${T("Every drop")}</h4><ul class="ld-list">${drops.map(row).join("")}${wait.map(wrow).join("")}</ul>
      <p class="ld-foot">${T("Anyone can send a coin's drop to every holder — gas is on the sender, tokens only go to the holders.")} <a href="${esc(explorer())}/address/${esc(d.vault)}" target="_blank" rel="noopener">${T("Vault contract")}</a></p></div>`;
  }
  function vConsoleHtml() {
    const c = S.con;
    if (!c || c.mode !== "vault") return "";
    const isTr = me() && c.treasury && me() === lc(c.treasury);
    const rows = (c.todo || []).map((x, i) => `<div class="ld-ct"><div><b data-no-i18n>$${esc(x.sym)}</b> <small>${wk(x.ws, true)} · ${tok(x.need)}${BigInt(x.deposited || "0") > 0n ? ` (${T("already in")}: ${tok(x.deposited)})` : ""}</small></div>
      ${x.blocked ? `<span class="ld-st bad">${T("No veARCIRCLE at the snapshot")}</span>` : `<button type="button" class="ld-btn pri" data-ld="deposit" data-i="${i}"${!isTr || S.busy ? " disabled" : ""}>${S.busy === "dep:" + i ? T("Depositing…") : T("Deposit 4%")}</button>`}</div>`).join("");
    return `<div class="ld-console"><h4>${T("Treasury console")}</h4>
      <p>${isTr ? T("One deposit per coin (approve, then deposit). The vault does the rest: snapshot, split, and payouts.") : `${T("Connect the treasury wallet to deposit")}: <code data-no-i18n>${esc(c.treasury || "—")}</code>`}</p>
      ${rows || `<p class="ld-none">${T("Nothing to deposit.")}</p>`}</div>`;
  }
  function vaultPaint(d) {
    host.innerHTML = `<section class="ams-card ld-card">
      <div class="ld-top"><span class="ld-badge">${T("On-chain")}</span><h3>${T("Launch Drop")}</h3></div>
      <p class="ld-lede">${T("4% of every new ArcPad coin goes to veARCIRCLE holders, paid by a contract. Your share of a coin is set when the week it launched began (Thursday 00:00 UTC): your veARCIRCLE then, out of all veARCIRCLE then. Claim any time, or anyone can send it to you.")}</p>
      ${vWeekHtml(d)}${vMineHtml(d)}${vAllHtml(d)}${vConsoleHtml()}${rhHtml(d)}${S.msg ? `<div class="ld-msg" role="status">${esc(S.msg)}</div>` : ""}
    </section>`;
  }
  const errText = (e) => String((e && (e.shortMessage || e.reason || e.message)) || e).slice(0, 200);
  async function signerVault() {
    if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    return new ethers.Contract(S.d.vault, VAULT_ABI, state.signer);
  }
  async function vClaim() {
    const list = (S.d && S.d.claimable) || [];
    if (!list.length || S.busy) return;
    S.busy = "claim"; S.msg = ""; paint();
    try {
      const v = await signerVault();
      for (let i = 0; i < list.length; i += 20) {
        S.msg = list.length > 20 ? `${tr("Confirm claim")} ${i / 20 + 1}/${Math.ceil(list.length / 20)}…` : tr("Confirm in your wallet…"); paint();
        await (await v.claim(list.slice(i, i + 20))).wait();
      }
      S.msg = tr("Claimed — the coins are in your wallet.");
    } catch (e) { S.msg = errText(e); }
    S.busy = ""; await load();
  }
  async function vPush(token) {
    if (S.busy) return;
    S.busy = "push:" + token; S.msg = ""; paint();
    try {
      const r = await fetch(`/api/desk?stake=dropholders&token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      const hs = (j && j.holders) || [];
      if (!hs.length) throw new Error(tr("Every holder already has this drop."));
      const v = await signerVault();
      for (let i = 0; i < hs.length; i += 100) {
        S.msg = `${tr("Confirm send")} ${i / 100 + 1}/${Math.ceil(hs.length / 100)}…`; paint();
        await (await v.pushTo(token, hs.slice(i, i + 100).map((h) => h[0]))).wait();
      }
      S.msg = tr("Sent to every holder.");
    } catch (e) { S.msg = errText(e); }
    S.busy = ""; await load();
  }
  async function vDeposit(i) {
    const x = S.con && S.con.todo[i];
    if (!x || S.busy || x.blocked) return;
    S.busy = "dep:" + i; S.msg = ""; paint();
    try {
      const v = await signerVault();
      const erc = new ethers.Contract(x.token, ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"], state.signer);
      const need = BigInt(x.need), bal = await erc.balanceOf(me());
      if (bal < need) throw new Error(`${tr("The treasury holds")} ${tok(bal.toString())} $${x.sym}, ${tr("the drop needs")} ${tok(x.need)}.`);
      if ((await erc.allowance(me(), S.d.vault)) < need) { S.msg = tr("Approve in your wallet…"); paint(); await (await erc.approve(S.d.vault, need)).wait(); }
      S.msg = tr("Confirm the deposit…"); paint();
      await (await v.deposit(x.token, need)).wait();
      S.msg = `$${x.sym}: ${tr("deposited — holders can claim now.")}`;
    } catch (e) { S.msg = errText(e); }
    S.busy = ""; await load();
  }

  // ---------------- Robinhood Chain (contracts/ArcLaunchDropRH.sol, api/_launchdrop-rh.mjs) ----------------
  // Same rule; veARCIRCLE lives on Arc, so each week's holders are posted to the vault as a Merkle root (by the
  // treasury, from the console below) and claims carry a proof. Claims open 12 hours after a root is posted.
  const RH_ABI = [
    "function claim(tuple(address token, uint256 ve, bytes32[] proof)[] list) returns (uint256)",
    "function postRoot(uint256 week, bytes32 root, uint256 supply)", "function deposit(address token, uint256 amount)",
  ];
  const rhCoin = (c) => `<a class="ld-coin" href="/arc#explore?plat=arcpad&coin=${esc(c.token)}" data-no-i18n>$${esc(c.sym)}</a>`;
  function rhHtml(d) {
    const r = S.rh;
    if (!r) return "";
    const t = Date.now() / 1000;
    const mine = (r.mine || []).filter((x) => BigInt(x.claimable) > 0n || BigInt(x.paid) > 0n || !x.open);
    const ready = mine.filter((x) => BigInt(x.claimable) > 0n);
    const rootOf = new Map((r.roots || []).map((w) => [w.ws, w]));
    const st = (x) => { const w = rootOf.get(x.ws); if (!w || !w.posted) return [T("Waiting for the week's holder list"), "mid"]; if (!w.open) return [`${T("Opens in")} ${left(w.posted.opensAt - t)}`, "mid"]; return [null, ""]; };
    const row = (x) => { const A = BigInt(x.amount), open = (A - BigInt(x.claimed)) * 10000000n > A, p = open ? Math.min(pct(x.claimed, x.amount), 99.9) : 100, [s, k] = st(x); return `<li>${rhCoin(x)}<small>${wk(x.ws, true)} · ${tok(x.amount)}</small><span class="ld-bar" title="${p}%"><i style="width:${Math.min(100, p)}%"></i></span><span class="ld-st ${s ? k : open ? "mid" : "ok"}">${s || `${p}% ${T("claimed")}`}</span></li>`; };
    const wrow = (x) => `<li>${rhCoin(x)}<small>${wk(x.ws, true)}</small><span class="ld-st mid">${T("Waiting for the treasury's deposit")}</span></li>`;
    const mineHtml = me() && mine.length ? `<div class="ld-mine-box"><div class="ld-mb-h"><h4>${T("Your drops on Robinhood Chain")}</h4>${ready.length ? `<button type="button" class="ld-btn pri" data-ld="rhclaim"${S.busy ? " disabled" : ""}>${S.busy === "rhclaim" ? T("Claiming…") : `${T("Claim on Robinhood Chain")} (${ready.length})`}</button>` : ""}</div>
      <ul class="ld-list">${mine.map((x) => { const c = BigInt(x.claimable) > 0n, soon = !c && !x.open; return `<li>${rhCoin(x)}<span class="ld-amt">${tok(c ? x.claimable : soon ? x.owed : x.paid)}</span><span class="ld-st ${c || soon ? "mid" : "ok"}">${soon ? `${T("Opens in")} ${left(x.opensAt - t)}` : T(c ? "Ready to claim" : "Claimed")}</span></li>`; }).join("")}</ul></div>` : "";
    const drops = r.drops || [], wait = r.waiting || [];
    const all = drops.length || wait.length ? `<ul class="ld-list">${drops.map(row).join("")}${wait.map(wrow).join("")}</ul>` : `<p class="ld-none">${T("No ArcPad coins on Robinhood Chain yet — every new one is shared the same way.")}</p>`;
    return `<div class="ld-rh"><div class="ld-mb-h"><h4>${T("On Robinhood Chain")}</h4><span class="ld-chain">Robinhood Chain</span></div>
      <p class="ld-foot">${T("ArcPad coins launched on Robinhood Chain share 4% with veARCIRCLE holders by the same rule. Claims there need a little ETH for gas.")} <a href="${esc((RHC.EXPLORER || "https://robinhoodchain.blockscout.com") + "/address/" + r.vault)}" target="_blank" rel="noopener">${T("Vault contract")}</a></p>
      ${mineHtml}${all}${rhConsoleHtml(d)}</div>`;
  }
  function rhConsoleHtml(d) {
    const r = S.rh, tre = d && d.treasury;
    if (!r || !(consoleWanted() || (me() && tre && me() === lc(tre)))) return "";
    const isTr = me() && tre && me() === lc(tre);
    const t = Date.now() / 1000;
    const roots = (r.roots || []).filter((w) => w.tree && !w.match && (!w.posted || t < w.posted.opensAt));
    const dis = !isTr || S.busy ? " disabled" : "";
    const rr = roots.map((w) => `<div class="ld-ct"><div><b>${wk(w.ws)}</b> <small>${esc(w.tree.holders)} ${T("holders")} · ${w.posted ? T("posted root differs — correct it") : T("root not posted")}</small></div><button type="button" class="ld-btn pri" data-ld="rhroot" data-ws="${w.ws}"${dis}>${S.busy === "root:" + w.ws ? T("Posting…") : T("Post holder list")}</button></div>`).join("");
    const dr = (r.waiting || []).map((x, i) => `<div class="ld-ct"><div><b data-no-i18n>$${esc(x.sym)}</b> <small>${wk(x.ws, true)} · ${tok(x.need)}</small></div><button type="button" class="ld-btn pri" data-ld="rhdep" data-i="${i}"${dis}>${S.busy === "rhdep:" + i ? T("Depositing…") : T("Deposit 4%")}</button></div>`).join("");
    return `<div class="ld-console"><h4>${T("Treasury console")} · Robinhood Chain</h4>
      <p>${isTr ? T("Each week: post the veARCIRCLE holder list (a Merkle root anyone can rebuild from Arc) — claims open 12 hours later. Each coin: approve, then deposit its 4%.") : `${T("Connect the treasury wallet to deposit")}: <code data-no-i18n>${esc(tre || "—")}</code>`}</p>
      ${rr}${dr}${!rr && !dr ? `<p class="ld-none">${T("Nothing to do.")}</p>` : ""}</div>`;
  }
  async function rhRun(key, fn) {
    const W = window.arcArcpadRH && window.arcArcpadRH.wallet;
    if (!W || S.busy) return;
    S.busy = key; S.msg = ""; paint();
    const stay = await W.stay();
    W.hold(true);
    try {
      S.msg = tr("Switch your wallet to Robinhood Chain if it asks…"); paint();
      const sg = await W.signer();
      await fn(sg, W);
    } catch (e) { S.msg = W.why(e); }
    finally { if (!stay) await W.back(); W.hold(false); }
    S.busy = ""; await load();
  }
  const rhClaim = () => rhRun("rhclaim", async (sg, W) => {
    const list = (S.rh.mine || []).filter((x) => BigInt(x.claimable) > 0n).map((x) => ({ token: x.token, ve: BigInt(x.ve), proof: x.proof }));
    const v = new ethers.Contract(S.rh.vault, RH_ABI, sg);
    for (let i = 0; i < list.length; i += 10) {
      S.msg = list.length > 10 ? `${tr("Confirm claim")} ${i / 10 + 1}/${Math.ceil(list.length / 10)}…` : tr("Confirm in your wallet…"); paint();
      await W.wait(await v.claim(list.slice(i, i + 10)));
    }
    S.msg = tr("Claimed — the coins are in your wallet on Robinhood Chain.");
  });
  const rhRoot = (ws) => rhRun("root:" + ws, async (sg, W) => {
    const w = (S.rh.roots || []).find((x) => x.ws === Number(ws));
    if (!w || !w.tree) throw new Error(tr("No holder list for that week yet."));
    S.msg = tr("Confirm in your wallet…"); paint();
    await W.wait(await new ethers.Contract(S.rh.vault, RH_ABI, sg).postRoot(w.ws, w.tree.root, BigInt(w.tree.supply)));
    S.msg = tr("Posted — claims for that week open in 12 hours.");
  });
  const rhDeposit = (i) => rhRun("rhdep:" + i, async (sg, W) => {
    const x = S.rh.waiting[i];
    if (!x) return;
    const erc = new ethers.Contract(x.token, ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"], sg);
    const need = BigInt(x.need), bal = await erc.balanceOf(me());
    if (bal < need) throw new Error(`${tr("The treasury holds")} ${tok(bal.toString())} $${x.sym}, ${tr("the drop needs")} ${tok(x.need)}.`);
    if ((await erc.allowance(me(), S.rh.vault)) < need) { S.msg = tr("Approve in your wallet…"); paint(); await W.wait(await erc.approve(S.rh.vault, need)); }
    S.msg = tr("Confirm the deposit…"); paint();
    await W.wait(await new ethers.Contract(S.rh.vault, RH_ABI, sg).deposit(x.token, need));
    S.msg = `$${x.sym}: ${tr("deposited on Robinhood Chain.")}`;
  });

  function paint() {
    const d = S.d;
    if (!d) { host.innerHTML = ""; return; }
    if (d.mode === "vault") return vaultPaint(d);
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
    if (k === "claim") vClaim();
    if (k === "push") vPush(b.dataset.t);
    if (k === "deposit") vDeposit(Number(b.dataset.i));
    if (k === "rhclaim") rhClaim();
    if (k === "rhroot") rhRoot(b.dataset.ws);
    if (k === "rhdep") rhDeposit(Number(b.dataset.i));
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
