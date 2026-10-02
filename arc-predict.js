/* global CONFIG, ethers, state, connectWallet, ensureArcForWrite, readProvider */
// arc-predict.js — ARCIRCLE Predict, an ARCIRCLE PAD utility (arcpad.html#predict).
// UP / DOWN rounds on Arc tokens, paid in USDC (contracts/contracts/ArcPredict.sol, server api/_predict.mjs):
//   · markets   one per token pool and round length (5 minutes, 15 minutes, an hour), listed by the team
//   · a round   the price to beat is the pool's price when it opens; bets close 30 s before the end; the winning
//               side splits the pot after a 2% fee; one side empty or no move → everyone's stake back
//   · my bets   the connected wallet's recent bets, and one button to claim everything it won or got back
//   · staff     the owner / operator lists a market (a token's USDC pool + a round length) or stops one
// Reads: GET /api/desk?predict=state (every 3 s while open) and ?predict=mine&u=0x…. Writes go from the wallet.
// Deep link: #predict?m=<market id>
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-predict");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const EXPL = (kind, x) => `${(typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io"}/${kind}/${x}`;
  const txa = (h) => (h ? ` <a class="pd-tx" href="${EXPL("tx", h)}" target="_blank" rel="noopener" data-no-i18n>${short(h)} ↗</a>` : "");
  const usd = (n, d = 2) => (n == null || !isFinite(n) ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const big$ = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? "$" + (n / 1e3).toFixed(1) + "K" : usd(n, n < 100 ? 2 : 0));
  const px = (n) => (n == null || !isFinite(n) || n <= 0 ? "—" : "$" + (n >= 1 ? n.toLocaleString("en-US", { maximumFractionDigits: 4 }) : n.toLocaleString("en-US", { maximumSignificantDigits: 4 })));
  const pc = (n, d = 2) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d) + "%");
  const dur = (s) => (s % 3600 === 0 ? `${s / 3600}h` : s % 60 === 0 ? `${s / 60}m` : `${s}s`);
  const mmss = (s) => { s = Math.max(0, Math.floor(s)); return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const API = "/api/desk";
  const ABI = [
    "function bet(uint256 id, bool up) payable",
    "function claim(uint256[] ids) returns (uint256)",
    "function addMarket((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) key, uint32 duration) returns (uint256)",
    "function setActive(uint256 id, bool on)",
    "function payFees()",
  ];
  const DURS = [[300, "5 minutes"], [900, "15 minutes"], [3600, "1 hour"]];
  const S = { st: null, m: null, mine: null, booted: false, timer: 0, tick: 0, skew: 0, amt: "", busy: false, msg: null, list: null, acct: null, loadT: 0 };
  const nowC = () => Date.now() / 1000 + S.skew; // chain time

  // ---------------- skeleton ----------------
  function frame() {
    S.staffK = null;
    $("pd-body").innerHTML = `
      <div class="pd-stats" id="pd-stats"></div>
      <div class="pd-mkts" id="pd-mkts" role="tablist" aria-label="${T("Markets")}"></div>
      <div class="pd-main">
        <div class="ams-card pd-round" id="pd-round"></div>
        <div class="pd-side">
          <div class="ams-card pd-mine" id="pd-mine"></div>
          <div class="ams-card pd-past" id="pd-past"></div>
        </div>
      </div>
      <div class="ams-card pd-staff" id="pd-staff" hidden></div>`;
  }
  const skel = () => `<div class="pd-skel"><i></i><i></i><i></i></div>`;

  // ---------------- data ----------------
  async function load() {
    try {
      const r = await fetch(`${API}?predict=state`, { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && !j.error) { S.st = j; if (j.now) S.skew = j.now - Date.now() / 1000; S.loadT = Date.now(); }
    } catch { /* keep the last one */ }
  }
  const acct = () => (typeof state !== "undefined" && state.account ? lc(state.account) : null);
  async function loadMine() {
    const a = acct();
    S.acct = a;
    if (!a || !S.st || !S.st.live) { S.mine = null; return; }
    try { const r = await fetch(`${API}?predict=mine&u=${a}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (j && !j.error) S.mine = j; } catch { /* keep */ }
  }
  const market = () => (S.st && S.st.markets ? S.st.markets.find((m) => m.id === S.m) || null : null);
  function pickDefault() {
    if (!S.st || !S.st.markets || !S.st.markets.length) { S.m = null; return; }
    if (S.m != null && S.st.markets.some((m) => m.id === S.m)) return;
    const hm = /^#predict\?(?:.*&)?m=(\d+)/.exec(location.hash);
    const want = hm ? Number(hm[1]) : null;
    const live = S.st.markets.filter((m) => m.active);
    S.m = want != null && S.st.markets.some((m) => m.id === want) ? want : (live[0] || S.st.markets[0]).id;
  }

  // ---------------- render ----------------
  function render(opts = {}) {
    const st = S.st;
    if (!st) { $("pd-round").innerHTML = skel(); return; }
    if (!st.live) { soon(); return; }
    pickDefault();
    stats(); tabs(); round(); past(); mine();
    // the team panel holds a form: it's drawn again only when the wallet or the market changes, or after an action
    const sk = `${acct()}|${S.m}|${market() ? market().active : ""}|${S.st.markets.length}`;
    if (sk !== S.staffK || opts.staff) { S.staffK = sk; staff(); }
  }
  function soon() {
    $("pd-stats").innerHTML = "";
    $("pd-mkts").innerHTML = "";
    $("pd-round").innerHTML = `<div class="pd-soon"><b>${T("ARCIRCLE Predict opens soon")}</b><span>${T("Rounds start once its contract is deployed on Arc. Here is how a round will work:")}</span></div>${how()}`;
    $("pd-mine").innerHTML = `<h3>${T("Your bets")}</h3><p class="pd-empty">${T("Nothing yet.")}</p>`;
    $("pd-past").innerHTML = "";
    $("pd-past").hidden = true;
    $("pd-staff").hidden = true;
  }
  const how = () => `<ol class="pd-how"><li>${T("Each round opens with a price to beat: the token's price in its Uniswap v4 USDC pool.")}</li><li>${T("Put USDC on UP or DOWN. Bets close 30 seconds before the end.")}</li><li>${T("At the end the pool is read again — the winning side splits the whole pot, after a 2% fee.")}</li><li>${T("Nobody on the other side, or no move? Everyone gets their stake back.")}</li></ol>`;
  function stats() {
    const st = S.st, live = st.markets.filter((m) => m.active).length;
    $("pd-stats").innerHTML = [
      [String(live), "markets live"], [String(st.rounds), "rounds played"], [big$(st.volume), "volume"], [`${(st.feeBps / 100).toFixed(st.feeBps % 100 ? 1 : 0)}%`, "fee on wins"],
    ].map(([v, l]) => `<div class="pd-stat"><b data-no-i18n>${esc(v)}</b><span>${T(l)}</span></div>`).join("") + (st.paused ? `<div class="pd-paused">${T("New bets are paused by the team. Running rounds still settle and every claim works.")}</div>` : "");
  }
  function tabs() {
    const ms = S.st.markets;
    if (!ms.length) { $("pd-mkts").innerHTML = ""; return; }
    $("pd-mkts").innerHTML = ms.map((m) => {
      const ch = m.cur && m.price && m.cur.open ? (m.price / m.cur.open - 1) * 100 : null;
      return `<button type="button" role="tab" class="pd-mk${m.id === S.m ? " on" : ""}${m.active ? "" : " off"}" data-pd-m="${m.id}" aria-selected="${m.id === S.m}">
        <b data-no-i18n>${esc(m.sym)}</b><em data-no-i18n>${dur(m.duration)}</em><span class="pd-mk-ch ${ch > 0 ? "up" : ch < 0 ? "down" : ""}" data-no-i18n>${ch == null ? "" : pc(ch)}</span></button>`;
    }).join("");
  }
  function phase(r) {
    const t = nowC();
    if (!r) return { k: "wait", label: tr("Starting the next round…"), left: 0 };
    if (r.result !== "open") return { k: "done", label: tr("Settled"), left: 0 };
    if (t < r.lockAt) return { k: "open", label: tr("Bets close in"), left: r.lockAt - t, frac: (t - r.startAt) / Math.max(1, r.lockAt - r.startAt) };
    if (t < r.endAt) return { k: "locked", label: tr("Locked — ends in"), left: r.endAt - t, frac: (t - r.lockAt) / Math.max(1, r.endAt - r.lockAt) };
    return { k: "settling", label: tr("Ended — reading the pool…"), left: 0 };
  }
  const myBet = (rid) => (S.mine && S.mine.items ? S.mine.items.find((x) => x.round === rid) : null);
  function round() {
    const el = $("pd-round"), m = market();
    if (!m) { el.innerHTML = `<div class="pd-soon"><b>${T("No market yet")}</b><span>${T("The team lists the first tokens soon.")}</span></div>${how()}`; return; }
    const r = m.cur, ph = phase(r), fee = (r ? r.feeBps : S.st.feeBps) / 10000;
    const ch = r && m.price && r.open ? (m.price / r.open - 1) * 100 : null;
    const pot = r ? r.up + r.down : 0;
    const mult = (side) => (side > 0 ? (pot * (1 - fee)) / side : null);
    const mu = r ? mult(r.up) : null, md = r ? mult(r.down) : null;
    const upPct = pot > 0 ? (r.up / pot) * 100 : 50;
    const mine_ = r ? myBet(r.id) : null;
    const canBet = r && ph.k === "open" && !S.st.paused;
    const lim = S.st.limits;
    el.innerHTML = `
      <div class="pd-r-head">
        <div class="pd-r-tok"><span class="pd-glyph" aria-hidden="true" data-no-i18n>${esc((m.sym || "?").slice(0, 2))}</span><div><b data-no-i18n>${esc(m.sym)}</b><small><span data-no-i18n>${esc(m.name)}</span> · <a href="${EXPL("token", m.token)}" target="_blank" rel="noopener" data-no-i18n>${short(m.token)} ↗</a></small></div></div>
        <div class="pd-r-id">${r ? `${T("Round")} <b data-no-i18n>#${r.id}</b>` : ""}<em data-no-i18n>${dur(m.duration)}</em>${m.active ? "" : `<i class="pd-off">${T("Stopped")}</i>`}</div>
      </div>
      <div class="pd-prices">
        <div class="pd-pr"><small>${T("Price to beat")}</small><b data-no-i18n>${r ? px(r.open) : "—"}</b></div>
        <div class="pd-pr now ${ch > 0 ? "up" : ch < 0 ? "down" : ""}"><small>${T("Now")}</small><b data-no-i18n>${px(m.price)}</b><span data-no-i18n>${ch == null ? "" : (ch > 0 ? "▲ " : ch < 0 ? "▼ " : "") + pc(ch)}</span></div>
      </div>
      <div class="pd-clock pd-ph-${ph.k}" style="--f:${ph.frac != null ? Math.min(1, Math.max(0, ph.frac)).toFixed(3) : 1}">
        <span>${esc(ph.label)}</span><b data-pd-left data-no-i18n>${ph.left ? mmss(ph.left) : ""}</b><i aria-hidden="true"></i>
      </div>
      <div class="pd-pools" style="--up:${upPct.toFixed(1)}%">
        <div class="pd-pool up"><small>UP</small><b data-no-i18n>${usd(r ? r.up : 0)}</b><em data-no-i18n>${mu ? mu.toFixed(2) + "×" : "—"}</em></div>
        <div class="pd-bar" aria-hidden="true"><i></i></div>
        <div class="pd-pool down"><small>DOWN</small><b data-no-i18n>${usd(r ? r.down : 0)}</b><em data-no-i18n>${md ? md.toFixed(2) + "×" : "—"}</em></div>
      </div>
      ${mine_ ? `<div class="pd-pos ${mine_.side}">${T("You're in")} <b data-no-i18n>${mine_.side.toUpperCase()}</b> ${T("with")} <b data-no-i18n>${usd(mine_.stake)}</b>${(() => { const x = mine_.side === "up" ? mu : md; return x ? ` · ${T("if it wins ≈")} <b data-no-i18n>${usd(mine_.stake * x)}</b>` : ""; })()}</div>` : ""}
      <div class="pd-bet${canBet ? "" : " dis"}">
        <div class="pd-amt"><input id="pd-amt" type="number" min="0" step="any" inputmode="decimal" placeholder="USDC" value="${esc(S.amt)}" aria-label="${T("USDC to put in")}"${canBet ? "" : " disabled"}>
          <div class="pd-chips">${[1, 2, lim.maxBet].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => `<button type="button" data-pd-amt="${v}"${canBet ? "" : " disabled"} data-no-i18n>$${v}</button>`).join("")}</div></div>
        <div class="pd-go"><button type="button" class="pd-up" data-pd-bet="up"${canBet && (!mine_ || mine_.side === "up") ? "" : " disabled"}><span>UP</span><small>${T("price ends higher")}</small></button>
          <button type="button" class="pd-down" data-pd-bet="down"${canBet && (!mine_ || mine_.side === "down") ? "" : " disabled"}><span>DOWN</span><small>${T("price ends lower")}</small></button></div>
        <p class="pd-small"><span data-no-i18n>${usd(lim.minBet)}–${usd(lim.maxBet)}</span> ${T("a round per wallet · one side per round · paid out in USDC on Arc")}</p>
      </div>
      <p class="pd-msg${S.msg ? " " + S.msg.cls : ""}" aria-live="polite">${S.msg ? S.msg.h : ""}</p>`;
  }
  function past() {
    const el = $("pd-past"), m = market();
    el.hidden = !m;
    if (!m) return;
    const rows = m.past || [];
    el.innerHTML = `<h3>${T("Last rounds")}</h3>` + (rows.length ? `<div class="pd-hist">${rows.map((r) => {
      const ch = r.open && r.close ? (r.close / r.open - 1) * 100 : null;
      const k = r.result === "up" ? "up" : r.result === "down" ? "down" : "refund";
      return `<div class="pd-h ${k}"><i aria-hidden="true">${k === "up" ? "▲" : k === "down" ? "▼" : "↺"}</i><span data-no-i18n>#${r.id}</span><b>${T(k === "refund" ? "Refund" : k.toUpperCase())}</b><em data-no-i18n>${ch == null ? "" : pc(ch)}</em><small data-no-i18n>${usd(r.up + r.down)}</small></div>`;
    }).join("")}</div>` : `<p class="pd-empty">${T("The first round is still running.")}</p>`);
  }
  function mine() {
    const el = $("pd-mine"), a = acct();
    if (!a) { el.innerHTML = `<h3>${T("Your bets")}</h3><p class="pd-empty">${T("Connect a wallet to see your bets and claim what you won.")}</p><button type="button" class="pd-btn" data-pd-act="connect">${T("Connect wallet")}</button>`; return; }
    const M = S.mine;
    if (!M) { el.innerHTML = `<h3>${T("Your bets")}</h3>${skel()}`; return; }
    const items = (M.items || []).slice(0, 12);
    const sym = (id) => { const mk = S.st.markets.find((x) => x.id === id); return mk ? `${mk.sym} ${dur(mk.duration)}` : "—"; };
    const res = (x) => x.result === "open" ? `<em class="pd-live">${T(nowC() < x.endAt ? "live" : "settling")}</em>` : x.result === "refund" ? `<em>${T("refund")}</em>` : x.result === x.side ? `<em class="win">${T("won")}</em>` : `<em class="lost">${T("lost")}</em>`;
    el.innerHTML = `<h3>${T("Your bets")}</h3>` +
      (M.claimable > 0 ? `<div class="pd-claim"><div><small>${T("Ready to claim")}</small><b data-no-i18n>${usd(M.claimable)}</b></div><button type="button" class="pd-btn go" data-pd-act="claim">${T("Claim")}</button></div>` : "") +
      (items.length ? `<div class="pd-bets">${items.map((x) => `<div class="pd-b ${x.side}"><span data-no-i18n>#${x.round}</span><b data-no-i18n>${esc(sym(x.market))}</b><i data-no-i18n>${x.side.toUpperCase()}</i><span data-no-i18n>${usd(x.stake)}</span>${res(x)}${x.claimable > 0 ? `<small class="win" data-no-i18n>+${usd(x.claimable)}</small>` : x.claimed ? `<small>${T("claimed")}</small>` : "<small></small>"}</div>`).join("")}</div>` : `<p class="pd-empty">${T("No bets in the recent rounds.")}</p>`);
  }
  function staff() {
    const el = $("pd-staff"), a = acct(), st = S.st;
    const isStaff = a && (a === st.owner || a === st.operator);
    el.hidden = !isStaff;
    if (!isStaff) return;
    const m = market();
    const L = S.list || {};
    el.innerHTML = `<h3>${T("Team")} <small data-no-i18n>${a === st.owner ? "owner" : "operator"}</small></h3>
      <div class="pd-staff-g">
        <div><h4>${T("List a market")}</h4>
          <div class="pd-row"><input type="text" id="pd-lt" placeholder="${T("Arc token address (0x…)")}" value="${esc(L.t || "")}" spellcheck="false"><button type="button" class="pd-btn" data-pd-act="pools">${T("Find its USDC pools")}</button></div>
          <div class="pd-pools-l" id="pd-pools-l">${L.pools ? (L.pools.length ? L.pools.map((p, i) => `<label class="pd-pl"><input type="radio" name="pd-pl" value="${i}"${i === (L.pick || 0) ? " checked" : ""}><b>${esc(p.venue || "Uniswap v4")}</b><span data-no-i18n>${p.feePct != null ? p.feePct + "%" : ""}${p.dex && p.dex.liqUsd ? " · " + big$(p.dex.liqUsd) : ""}</span><small data-no-i18n>${short(p.id)}</small></label>`).join("") : `<p class="pd-empty">${T("No Uniswap v4 pool against USDC found for this token.")}</p>`) : ""}</div>
          <div class="pd-row pd-durs">${DURS.map(([s, l]) => `<button type="button" class="pd-btn${(L.d || 300) === s ? " on" : ""}" data-pd-dur="${s}">${T(l)}</button>`).join("")}</div>
          <button type="button" class="pd-btn go" data-pd-act="add"${L.pools && L.pools.length ? "" : " disabled"}>${T("List it")}</button></div>
        <div><h4>${T("This market")}</h4>
          ${m ? `<p class="pd-small"><b data-no-i18n>${esc(m.sym)} ${dur(m.duration)}</b> · ${T(m.active ? "running" : "stopped")}</p><button type="button" class="pd-btn" data-pd-act="toggle">${T(m.active ? "Stop after this round" : "Start again")}</button>` : `<p class="pd-empty">—</p>`}
          <h4>${T("Fees")}</h4><p class="pd-small">${T("All fees so far")}: <b data-no-i18n>${usd(st.fees)}</b></p><button type="button" class="pd-btn" data-pd-act="fees">${T("Send fees to the treasury")}</button>
          <p class="pd-small">${T("Contract")} <a href="${EXPL("address", st.address)}" target="_blank" rel="noopener" data-no-i18n>${short(st.address)} ↗</a></p></div>
      </div>
      <p class="pd-msg${S.smsg ? " " + S.smsg.cls : ""}" aria-live="polite">${S.smsg ? S.smsg.h : ""}</p>`;
  }

  // ---------------- writes ----------------
  async function signer() {
    if ((typeof state === "undefined" || !state.signer) && typeof connectWallet === "function") await connectWallet();
    if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    if (typeof state === "undefined" || !state.signer) throw new Error(tr("Connect a wallet first."));
    return state.signer;
  }
  const errText = (e) => {
    if (e && (e.code === "ACTION_REJECTED" || e.code === 4001)) return tr("Cancelled in your wallet.");
    const s = String((e && (e.shortMessage || e.reason || e.message)) || "");
    const map = { NotOpen: "Bets for this round are closed.", OverMaxBet: "That's over the most a wallet can put in one round.", OverMaxSide: "This side of the round is full.", OtherSide: "You already bet on the other side of this round.", TooSmall: "That's under the smallest bet.", IsPaused: "New bets are paused.", NothingToClaim: "Nothing to claim right now." };
    for (const k of Object.keys(map)) if (s.includes(k)) return tr(map[k]);
    return (s || tr("The transaction didn't go through.")).slice(0, 180);
  };
  const contract = (sg) => new ethers.Contract(S.st.address, ABI, sg);
  function say(h, cls = "") { S.msg = { h, cls }; const p = panel.querySelector(".pd-round .pd-msg"); if (p) { p.className = "pd-msg " + cls; p.innerHTML = h; } }
  function sayStaff(h, cls = "") { S.smsg = { h, cls }; const p = panel.querySelector(".pd-staff .pd-msg"); if (p) { p.className = "pd-msg " + cls; p.innerHTML = h; } }
  async function placeBet(side) {
    if (S.busy) return;
    const m = market(), r = m && m.cur;
    if (!r) return;
    const v = Number(String(($("pd-amt") || {}).value || "").replace(/,/g, ""));
    const lim = S.st.limits;
    if (!(v > 0)) { say(T("Enter an amount of USDC."), "err"); return; }
    if (v < lim.minBet) { say(`${T("The smallest bet is")} <b data-no-i18n>${usd(lim.minBet)}</b>.`, "err"); return; }
    const mineNow = myBet(r.id);
    if (v + (mineNow ? mineNow.stake : 0) > lim.maxBet + 1e-9) { say(`${T("A wallet can put at most")} <b data-no-i18n>${usd(lim.maxBet)}</b> ${T("in one round.")}`, "err"); return; }
    S.busy = true;
    try {
      const sg = await signer();
      const wei = ethers.parseEther(String(v));
      const bal = await sg.provider.getBalance(await sg.getAddress()).catch(() => null);
      if (bal != null && bal < wei + ethers.parseEther("0.02")) throw new Error(tr("This wallet doesn't hold that much USDC (keep a little for gas)."));
      if (nowC() >= r.lockAt - 2) throw new Error(tr("Bets for this round are closed."));
      say(T("Confirm in your wallet…"));
      const tx = await contract(sg).bet(r.id, side === "up", { value: wei });
      say(`${T("Placing your bet…")}${txa(tx.hash)}`);
      await tx.wait();
      say(`${T("You're in")} <b data-no-i18n>${side.toUpperCase()}</b> ${T("with")} <b data-no-i18n>${usd(v)}</b>.${txa(tx.hash)}`, "ok");
      S.amt = "";
      await Promise.all([load(), loadMine()]);
      render();
    } catch (e) { say(esc(errText(e)), "err"); } finally { S.busy = false; }
  }
  async function claimAll() {
    if (S.busy || !S.mine || !S.mine.claimIds || !S.mine.claimIds.length) return;
    S.busy = true;
    const btn = panel.querySelector('[data-pd-act="claim"]'); if (btn) btn.disabled = true;
    try {
      const sg = await signer();
      const tx = await contract(sg).claim(S.mine.claimIds.slice(0, 60));
      await tx.wait();
      await loadMine(); render();
      say(`${T("Claimed — the USDC is in your wallet.")}${txa(tx.hash)}`, "ok");
    } catch (e) { say(esc(errText(e)), "err"); render(); } finally { S.busy = false; }
  }
  async function findPools() {
    const t = String(($("pd-lt") || {}).value || "").trim();
    S.list = Object.assign({}, S.list, { t });
    if (!isAddr(t)) { sayStaff(T("Paste an Arc token address (0x…)."), "err"); return; }
    sayStaff(T("Looking for its pools…"));
    let j = null;
    for (let i = 0; i < 8; i++) {
      try { const r = await fetch(`/api/social?liq=${t}`, { cache: "no-store" }); j = r.ok ? await r.json() : null; } catch { j = null; }
      if (j && j.done) break;
      await new Promise((r) => setTimeout(r, 2500));
    }
    const usdcA = lc((typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || "0x3600000000000000000000000000000000000000");
    const pools = ((j && j.pools) || []).filter((p) => p.key && [p.key.currency0, p.key.currency1].map(lc).some((c) => c === usdcA || c === "0x0000000000000000000000000000000000000000"));
    S.list = Object.assign({}, S.list, { pools, pick: 0 });
    S.smsg = null;
    staff();
  }
  async function addMarket() {
    const L = S.list || {};
    const p = L.pools && L.pools[L.pick || 0];
    if (!p) return;
    try {
      const sg = await signer();
      sayStaff(T("Confirm in your wallet…"));
      const k = p.key;
      const tx = await contract(sg).addMarket([k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks], L.d || 300);
      await tx.wait();
      S.list = null;
      await load(); S.m = S.st.markets.length ? S.st.markets[S.st.markets.length - 1].id : S.m;
      render();
      sayStaff(`${T("Listed. The keeper opens its first round within a minute or two.")}${txa(tx.hash)}`, "ok");
    } catch (e) { sayStaff(esc(errText(e)), "err"); }
  }
  async function staffTx(kind) {
    try {
      const sg = await signer();
      sayStaff(T("Confirm in your wallet…"));
      const m = market();
      const tx = kind === "toggle" ? await contract(sg).setActive(m.id, !m.active) : await contract(sg).payFees();
      await tx.wait();
      await load(); render();
      sayStaff(`${T("Done.")}${txa(tx.hash)}`, "ok");
    } catch (e) { sayStaff(esc(errText(e)), "err"); }
  }

  // ---------------- events ----------------
  panel.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-pd-m],[data-pd-amt],[data-pd-bet],[data-pd-act],[data-pd-dur]");
    if (!t) return;
    if (t.dataset.pdM != null) {
      S.m = Number(t.dataset.pdM); S.msg = null;
      try { history.replaceState(null, "", `#predict?m=${S.m}`); } catch { /* fine */ }
      render(); return;
    }
    if (t.dataset.pdAmt) { const i = $("pd-amt"); if (i) { i.value = t.dataset.pdAmt; S.amt = i.value; } return; }
    if (t.dataset.pdBet) { placeBet(t.dataset.pdBet); return; }
    if (t.dataset.pdDur) { S.list = Object.assign({}, S.list, { d: Number(t.dataset.pdDur), t: String(($("pd-lt") || {}).value || "") }); staff(); return; }
    const a = t.dataset.pdAct;
    if (a === "connect") { if (typeof connectWallet === "function") connectWallet().then(() => { loadMine().then(render); }).catch(() => {}); }
    else if (a === "claim") claimAll();
    else if (a === "pools") findPools();
    else if (a === "add") addMarket();
    else if (a === "toggle" || a === "fees") staffTx(a);
  });
  panel.addEventListener("input", (e) => {
    if (e.target && e.target.id === "pd-amt") S.amt = e.target.value;
    if (e.target && e.target.id === "pd-lt") S.list = Object.assign({}, S.list, { t: e.target.value });
  });
  panel.addEventListener("change", (e) => { if (e.target && e.target.name === "pd-pl") S.list = Object.assign({}, S.list, { pick: Number(e.target.value) }); });

  // the countdown moves every second; the data every 3 s (the round card only re-renders when nothing is being typed)
  function tick() {
    const m = market(), r = m && m.cur;
    const el = panel.querySelector("[data-pd-left]");
    if (!r || !el) return;
    const ph = phase(r);
    const box = panel.querySelector(".pd-clock");
    if (box && !box.classList.contains("pd-ph-" + ph.k)) { if (!typing()) round(); return; }
    el.textContent = ph.left ? mmss(ph.left) : "";
    if (box && ph.frac != null) box.style.setProperty("--f", Math.min(1, Math.max(0, ph.frac)).toFixed(3));
  }
  const typing = () => { const a = document.activeElement; return !!(a && panel.contains(a) && (a.tagName === "INPUT")); };
  async function refresh() {
    if (document.hidden || !panel.classList.contains("active")) return;
    await load();
    if (acct() !== S.acct || Date.now() - (S.mineT || 0) > 9000) { S.mineT = Date.now(); await loadMine(); }
    if (typing()) { stats(); tabs(); past(); return; }
    render();
  }
  async function show() {
    if (!S.booted) {
      S.booted = true;
      frame();
      render();
      await load();
      await loadMine();
      render();
    }
    clearInterval(S.timer); clearInterval(S.tick);
    S.timer = setInterval(refresh, 3000);
    S.tick = setInterval(tick, 1000);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "predict") show(); else { clearInterval(S.timer); clearInterval(S.tick); } });
  window.addEventListener("hashchange", () => {
    const m = /^#predict\?(?:.*&)?m=(\d+)/.exec(location.hash);
    if (m && S.booted) { S.m = Number(m[1]); render(); }
  });
  document.addEventListener("arc:lang", () => { if (S.booted) { frame(); render(); } });
  if (panel.classList.contains("active")) show();
  window.arcPredict = { state: () => S.st, market: () => S.m, refresh: () => refresh() };
})();
