// arc-quantum.js — Quantum Launch on ArcPad (contracts/QuantumLaunch.sol: QuantumPad + one QuantumBatch per launch).
// A coin is announced first. While it's "in superposition" (1 minute to 1 hour) anyone can commit USDC to it; when the
// window ends anyone can collapse it: one transaction launches the coin on ArcPad and buys with everything committed,
// so everyone gets the same price and nobody can buy ahead (the coin's pool doesn't exist until then).
//   · the launch form: "Instant" or "Quantum Launch" (ArcPad on Arc, USDC pair), the window and an optional per-wallet cap
//   · #quantum — live and recent Quantum launches; #quantum?b=0x… — one launch: commit / take back, collapse, claim,
//     refunds, the creator's "call it off"
//   · Explore: a strip of the launches still in superposition; a coin page: a "Quantum launch" badge
// Nothing here moves money on its own: every step is the user's own transaction.
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PAD = () => (typeof CONFIG !== "undefined" && CONFIG.QUANTUM_PAD_ADDRESS) || "";
  const USDC = "0x3600000000000000000000000000000000000000";
  const SELLABLE = 920e6, GRACE = 86400;
  const EXPL = () => ((typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io").replace(/\/$/, "");
  const META_T = "(string imageUrl,string description,string twitter,string telegram,string discord,string website)";
  const PAD_ABI = [`function open(string,string,uint256,uint16,${META_T},uint64,uint256) payable returns (address)`, "function latest(uint256) view returns (address[])", "function batchOfToken(address) view returns (address)",
    "event Opened(address indexed batch, address indexed creator, string name, string symbol, uint64 endsAt, uint256 maxPerWallet)"];
  const B_ABI = ["function info(address) view returns (uint8,uint64,uint64,uint256,uint256,uint256,address,uint256,uint256,uint256,bool,uint256,address)",
    "function name() view returns (string)", "function symbol() view returns (string)", `function meta() view returns (${META_T})`, "function initialVirtualQuote() view returns (uint256)", "function extraFeeBps() view returns (uint16)", "function feeRefunded() view returns (bool)",
    "function commit(uint256)", "function uncommit(uint256)", "function collapse() returns (address)", "function claim()", "function refund()", "function refundFee()", "function cancel()"];
  const ERC = ["function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];
  const WINDOWS = [[60, "1 min"], [300, "5 min"], [900, "15 min"], [3600, "1 hour"]];
  const Q = { on: false, win: 300, cap: "", list: null, listAt: 0, cur: "", d: null, busy: "", msg: null, amt: "", meta: new Map(), badge: new Map(), prevState: new Map() };

  const rp = () => (typeof readProvider === "function" ? readProvider() : null);
  const me = () => (typeof state !== "undefined" && state.account ? lc(state.account) : "");
  const now = () => Math.floor(Date.now() / 1000);
  const fmtU = (raw) => { const v = Number(raw) / 1e6; return "$" + v.toLocaleString("en-US", { maximumFractionDigits: v >= 100 ? 0 : 2 }); };
  const fmtT = (v) => (v >= 1e9 ? (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const fmtP = (p) => { if (!(p > 0)) return "—"; if (p >= 0.01) return "$" + p.toFixed(4); const s = p.toFixed(12).replace(/0+$/, ""); const m = /^0\.(0+)(\d{1,4})/.exec(s); return m && m[1].length >= 4 ? `$0.0${String(m[1].length).split("").map((d) => "₀₁₂₃₄₅₆₇₈₉"[d]).join("")}${m[2]}` : "$" + Number(p.toPrecision(3)); };
  const clock = (sec) => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`; };
  const safeImg = (u) => /^(https:\/\/|data:image\/(png|jpe?g|webp|gif);)/i.test(String(u || ""));
  async function signer() {
    if ((typeof state === "undefined" || !state.signer) && typeof connectWallet === "function") await connectWallet();
    if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
    if (typeof state === "undefined" || !state.signer) throw new Error(tr("Connect a wallet first."));
    return state.signer;
  }
  const errText = (e) => { const m = String((e && (e.reason || e.shortMessage || e.message)) || e || ""); if (e && (e.code === 4001 || e.code === "ACTION_REJECTED") || /reject|denied|cancel/i.test(m)) return tr("You cancelled it."); const r = /reverted with reason string '([^']+)'|reason="([^"]+)"|execution reverted: ([^"]+)/.exec(m); return (r && (r[1] || r[2] || r[3])) || m.slice(0, 160) || tr("Something went wrong. Try again."); };

  // ---------------- the numbers: what everyone would get if it collapsed with `total` committed ----------------
  /// ArcPad's pool is single-sided from the opening price up, i.e. x·y = k with x = the virtual quote, y = 920M:
  /// a buy of `x` gets 920M·x/(V+x), less the trade fee (1% + the creator's add-on) taken from the output
  function estimate(m, totalRaw) {
    const V = Number(m.ivq) / 1e6, x = Number(totalRaw) / 1e6, feeBps = 100 + Number(m.extra || 0);
    const open = V / SELLABLE;
    if (!(x > 0)) return { open, avg: open, after: open, tokens: 0, mcapAfter: open * 1e9 };
    const out = (SELLABLE * x) / (V + x) * (1 - feeBps / 10000);
    const after = ((V + x) * (V + x)) / (V * SELLABLE);
    return { open, avg: x / out, after, tokens: out, mcapAfter: after * 1e9 };
  }

  // ---------------- reads ----------------
  async function metaOf(b) {
    if (Q.meta.has(b)) return Q.meta.get(b);
    const c = new ethers.Contract(b, B_ABI, rp());
    const [name, symbol, meta, ivq, extra] = await Promise.all([c.name(), c.symbol(), c.meta(), c.initialVirtualQuote(), c.extraFeeBps()]);
    const m = { b, name, symbol, img: meta[0] || meta.imageUrl || "", desc: meta[1] || meta.description || "", ivq, extra: Number(extra) };
    Q.meta.set(b, m);
    return m;
  }
  async function infoOf(b) {
    const c = new ethers.Contract(b, B_ABI, rp());
    const r = await c.info(me() || "0x0000000000000000000000000000000000000000");
    return { st: Number(r[0]), opened: Number(r[1]), ends: Number(r[2]), total: r[3], n: Number(r[4]), cap: r[5], token: lc(r[6]), bought: r[7], left: r[8], mine: r[9], claimed: r[10], myTokens: r[11], creator: lc(r[12]) };
  }
  /// state for the page: 0 superposition · 1 collapsed · 2 refunding · 3 window closed, waiting for the collapse
  const phase = (i) => (i.st === 0 && now() >= i.ends ? 3 : i.st);
  async function loadList(force) {
    if (!PAD() || !rp()) return [];
    if (!force && Q.list && Date.now() - Q.listAt < 8000) return Q.list;
    const p = new ethers.Contract(PAD(), PAD_ABI, rp());
    const bs = (await p.latest(40)).map(lc);
    const rows = await Promise.all(bs.map(async (b) => { try { const [m, i] = await Promise.all([metaOf(b), infoOf(b)]); return { ...m, ...i }; } catch { return null; } }));
    Q.list = rows.filter(Boolean); Q.listAt = Date.now();
    return Q.list;
  }

  // ---------------- the launch form: Instant or Quantum ----------------
  const panel = () => $("bp-panel-launch");
  const pairUsdc = () => typeof ARC === "undefined" || !ARC.pair || (ARC.pair.key || "usdc") === "usdc";
  function on() { const p = panel(); return !!(Q.on && PAD() && p && (p.dataset.plat || "arcpad") === "arcpad" && p.dataset.net !== "rh" && pairUsdc()); }
  function paintMode() {
    const host = panel() && panel().querySelector(".ap-arc-only");
    if (!host) return;
    let box = $("q-mode");
    if (!box) { box = document.createElement("div"); box.id = "q-mode"; box.className = "q-mode"; host.prepend(box); }
    const live = !!PAD(), usdcOk = pairUsdc();
    const qOn = Q.on && live && usdcOk;
    box.innerHTML = `<div class="q-mode-h"><span>${T("Launch mode")}</span></div>
      <div class="q-seg" role="radiogroup" aria-label="${T("Launch mode")}">
        <button type="button" role="radio" data-q-mode="instant" aria-checked="${!qOn}"><b>${T("Instant")}</b><small>${T("Trading opens the moment it launches")}</small></button>
        <button type="button" role="radio" data-q-mode="quantum" aria-checked="${qOn}"${live && usdcOk ? "" : ' aria-disabled="true"'}><b>${T("Quantum Launch")}<i class="q-new">${T(live ? "No snipers" : "Soon")}</i></b><small>${T("Everyone who commits in the first minutes gets the same price")}</small></button>
      </div>
      ${!usdcOk && Q.on ? `<p class="hint q-warn">${T("Quantum Launch pairs with USDC. Pick USDC as the pair to use it.")}</p>` : ""}
      ${qOn ? `<div class="q-opts">
        <div class="q-opt"><span>${T("Superposition lasts")}</span><div class="q-chips">${WINDOWS.map(([s, l]) => `<button type="button" data-q-win="${s}" aria-pressed="${Q.win === s}">${T(l)}</button>`).join("")}</div></div>
        <label class="q-opt"><span>${T("Per-wallet cap")} <em class="optional">${T("optional")}</em></span><span class="cn-input-suffix-wrap"><input id="q-cap" type="text" inputmode="decimal" placeholder="${T("No cap")}" value="${esc(Q.cap)}"><span class="cn-input-suffix">USDC</span></span></label>
        <ol class="q-how-mini"><li>${T("You announce the coin — it isn't tradeable yet.")}</li><li>${T("For the window you pick, anyone commits USDC (you too, like everyone else).")}</li><li>${T("Then one transaction launches it and buys with all of it: everyone gets the same price, nobody gets in ahead.")}</li></ol>
      </div>` : ""}`;
    panel().classList.toggle("q-on", qOn);
    const lbl = panel().querySelector("#ap-launch-submit .ap-launch-btn-label");
    if (lbl && !lbl.closest(".is-busy")) { if (qOn) { if (!lbl.dataset.qWas) lbl.dataset.qWas = lbl.textContent; lbl.textContent = tr("Announce the Quantum Launch"); } else if (lbl.dataset.qWas) { lbl.textContent = lbl.dataset.qWas; delete lbl.dataset.qWas; } }
  }
  document.addEventListener("click", (e) => {
    const m = e.target.closest("[data-q-mode]");
    if (m) {
      if (m.getAttribute("aria-disabled") === "true") { const st = $("ap-launch-status"); if (st && !PAD()) st.innerHTML = `<div class="status pending">${T("Quantum Launch opens soon.")}</div>`; Q.on = m.dataset.qMode === "quantum"; paintMode(); return; }
      Q.on = m.dataset.qMode === "quantum"; paintMode(); return;
    }
    const w = e.target.closest("[data-q-win]");
    if (w) { Q.win = Number(w.dataset.qWin); paintMode(); return; }
    if (e.target.closest("#ap-pair-seg") || e.target.closest("#agl-plat")) setTimeout(paintMode, 60);
  });
  document.addEventListener("input", (e) => { if (e.target.id === "q-cap") Q.cap = e.target.value; });

  /// called by the launch form (arcpad.js) instead of the factory when Quantum Launch is on
  async function submit(a) {
    const st = a.statusEl, btn = a.btn;
    const say = (h, k) => { if (st) st.innerHTML = `<div class="status ${k || "pending"}">${h}</div>`; };
    let capRaw = 0n;
    const cs = String(Q.cap || "").replace(/,/g, "").trim();
    if (cs) { if (!(Number(cs) >= 0.1)) { say(T("The per-wallet cap has to be at least 0.10 USDC, or empty for no cap."), "error"); return; } capRaw = ethers.parseUnits(String(Number(Number(cs).toFixed(6))), 6); }
    btn.disabled = true; btn.classList.add("is-busy");
    try {
      const s = await signer();
      const pad = new ethers.Contract(PAD(), PAD_ABI, s);
      const fee = await new ethers.Contract(CONFIG.ARCPAD_FACTORY_ADDRESS, ["function LAUNCH_FEE() view returns (uint256)"], rp()).LAUNCH_FEE();
      say(T("Confirm the Quantum Launch in your wallet…"));
      const tx = await pad.open(a.name, a.symbol, a.initialVirtualQuote, a.extraFeeBps, a.meta, Q.win, capRaw, { value: fee });
      say(`${T("Announcing…")} <a class="mono-link" href="${EXPL()}/tx/${tx.hash}" target="_blank" rel="noopener">tx ↗</a>`);
      const rc = await tx.wait();
      let batch = "";
      for (const l of rc.logs || []) { try { const ev = pad.interface.parseLog(l); if (ev && ev.name === "Opened") { batch = lc(ev.args.batch || ev.args[0]); break; } } catch { /* other logs */ } }
      if (!batch) throw new Error(tr("It went through, but the launch's address wasn't in the receipt — find it under Quantum launches."));
      say(`${T("It's in superposition.")} ${T("Share the link — commits are open for")} ${T(WINDOWS.find((w) => w[0] === Q.win)?.[1] || "")}.`, "success");
      fetch("/api/tg-launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quantum: batch }) }).catch(() => {});
      Q.list = null;
      const f = $("ap-launch-form"); if (f) f.reset();
      setTimeout(() => { location.hash = `#quantum?b=${batch}`; }, 700);
    } catch (e) { say(esc(errText(e)), "error"); }
    finally { btn.disabled = false; btn.classList.remove("is-busy"); }
  }

  // ---------------- the Quantum page ----------------
  const qPanel = () => $("bp-panel-quantum");
  const curFromHash = () => { const m = /^#quantum\?(?:.*&)?b=(0x[0-9a-fA-F]{40})/.exec(location.hash); return m ? lc(m[1]) : ""; };
  const active = () => { const p = qPanel(); return !!(p && p.classList.contains("active")); };
  function orb(m, ph, big) {
    const logo = m && safeImg(m.img) ? `<img src="${esc(m.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span>${esc(((m && m.symbol) || "?").slice(0, 1))}</span>`;
    return `<div class="q-orb ph${ph}${big ? " big" : ""}" aria-hidden="true"><i class="q-ring a"></i><i class="q-ring b"></i><i class="q-ring c"></i><b class="q-dot d1"></b><b class="q-dot d2"></b><b class="q-dot d3"></b><div class="q-core">${logo}</div></div>`;
  }
  const PH = ["In superposition", "Collapsed", "Refunds open", "Ready to collapse"];
  function card(r) {
    const ph = phase(r);
    const sub = ph === 0 ? `<span data-q-end="${r.ends}">${clock(r.ends - now())}</span>` : ph === 1 ? esc(tr("{sym} is live").replace("{sym}", "$" + r.symbol)) : ph === 3 ? T("Anyone can collapse it now") : T("Committers can take their USDC back");
    return `<a class="q-card ph${ph}" href="#quantum?b=${r.b}">${orb(r, ph)}<div class="q-card-t"><b data-no-i18n>${esc(r.name)} <small>$${esc(r.symbol)}</small></b><span class="q-chip ph${ph}">${T(PH[ph])}</span></div>
      <div class="q-card-n"><div><small>${T("Committed")}</small><b data-no-i18n>${fmtU(r.total)}</b></div><div><small>${T("Wallets")}</small><b data-no-i18n>${r.n}</b></div><div><small>${T(ph === 0 ? "Collapses in" : "Status")}</small><b data-no-i18n>${sub}</b></div></div></a>`;
  }
  async function paintList() {
    const host = $("q-body"); if (!host) return;
    if (!PAD()) { host.innerHTML = `<div class="q-empty"><b>${T("Quantum Launch opens soon")}</b><span>${T("Launches where everyone who joins in the first minutes gets the same price — no snipers, no bots ahead of you.")}</span></div>`; return; }
    if (!Q.list) host.innerHTML = `<div class="q-empty"><span>${T("Reading Quantum launches from Arc…")}</span></div>`;
    let rows;
    try { rows = await loadList(); } catch { host.innerHTML = `<div class="q-empty"><span>${T("Couldn't read Quantum launches right now — try again in a moment.")}</span></div>`; return; }
    if (curFromHash()) return;
    const live = rows.filter((r) => phase(r) === 0 || phase(r) === 3), done = rows.filter((r) => phase(r) === 1).slice(0, 12), ref = rows.filter((r) => phase(r) === 2).slice(0, 6);
    host.innerHTML = `<div class="q-sec"><h3>${T("In superposition")}</h3>${live.length ? `<div class="q-grid">${live.map(card).join("")}</div>` : `<div class="q-empty"><span>${T("Nothing in superposition right now.")}</span><a class="bp-btn-primary" href="#launch" data-q-start>${T("Start a Quantum Launch")}</a></div>`}</div>
      ${done.length ? `<div class="q-sec"><h3>${T("Collapsed")}</h3><div class="q-grid">${done.map(card).join("")}</div></div>` : ""}
      ${ref.length ? `<div class="q-sec"><h3>${T("Refunds open")}</h3><div class="q-grid">${ref.map(card).join("")}</div></div>` : ""}`;
  }
  async function loadDetail(b) {
    const [m, i] = await Promise.all([metaOf(b), infoOf(b)]);
    let fr = false; if (i.st === 2 || phase(i) === 2) { try { fr = await new ethers.Contract(b, B_ABI, rp()).feeRefunded(); } catch { /* fine */ } }
    let bal = null, allow = null;
    if (me() && phase(i) === 0) { try { const u = new ethers.Contract(USDC, ERC, rp()); [bal, allow] = await Promise.all([u.balanceOf(me()), u.allowance(me(), b)]); } catch { /* later */ } }
    const was = Q.prevState.get(b); Q.prevState.set(b, phase(i));
    Q.d = { m, i, fr, bal, allow, justCollapsed: was != null && was !== 1 && phase(i) === 1 };
    return Q.d;
  }
  function detailHtml() {
    const { m, i, fr, bal } = Q.d, ph = phase(i), mine = i.mine > 0n, isCreator = me() && me() === i.creator;
    const e = estimate(m, i.total), share = i.total > 0n ? Number(i.mine) / Number(i.total) : 0;
    const left = i.ends - now();
    const page = `${location.origin}/arc#quantum?b=${m.b}`;
    let act = "";
    if (ph === 0) {
      act = `<div class="q-act-h"><b>${T(mine ? "Your commit" : "Commit USDC")}</b>${mine ? `<span data-no-i18n>${fmtU(i.mine)}${i.total > 0n ? ` · ${(share * 100).toFixed(1)}%` : ""}</span>` : ""}</div>
        <div class="q-in"><input id="q-amt" type="text" inputmode="decimal" placeholder="0.00" value="${esc(Q.amt)}" aria-label="${T("Amount in USDC")}"><span>USDC</span></div>
        <div class="q-chips">${[5, 10, 25, 100].map((v) => `<button type="button" data-q-amt="${v}">$${v}</button>`).join("")}${bal != null ? `<button type="button" data-q-amt="max">${T("Max")}</button>` : ""}</div>
        ${bal != null ? `<small class="q-fine">${T("Balance")}: <span data-no-i18n>${fmtU(bal)}</span>${i.cap > 0n ? ` · ${esc(tr("cap {usd} a wallet").replace("{usd}", fmtU(i.cap)))}` : ""}</small>` : ""}
        <div class="q-btns"><button type="button" class="bp-btn-primary" data-q="commit"${Q.busy ? " disabled" : ""}>${Q.busy === "commit" ? T("Committing…") : T("Commit")}</button>${mine ? `<button type="button" class="bp-btn-ghost" data-q="uncommit"${Q.busy ? " disabled" : ""}>${T("Take it back")}</button>` : ""}</div>
        <p class="q-fine">${T("Your USDC waits in the launch's own contract. Until the window ends you can take it back; after the collapse your tokens are yours to claim.")}</p>
        ${isCreator ? `<button type="button" class="q-link-btn" data-q="cancel"${Q.busy ? " disabled" : ""}>${T("Call the launch off (everyone is refunded)")}</button>` : ""}`;
    } else if (ph === 3) {
      act = `<div class="q-act-h"><b>${T("The window has closed")}</b></div>
        <p>${T("Anyone can collapse it now: one transaction launches the coin on ArcPad and buys with every commit, at one price for everyone.")}</p>
        <div class="q-btns"><button type="button" class="bp-btn-primary q-collapse-btn" data-q="collapse"${Q.busy ? " disabled" : ""}>${Q.busy === "collapse" ? T("Collapsing…") : T("Collapse it now")}</button></div>
        <p class="q-fine">${T("If nobody does within a day, everyone can take their USDC back.")} <span data-no-i18n>${clock(i.ends + GRACE - now())}</span></p>`;
    } else if (ph === 1) {
      const coin = `#coin/${i.token}`;
      act = `<div class="q-act-h"><b>${T("Collapsed into")} <span data-no-i18n>$${esc(m.symbol)}</span></b></div>
        <p>${T("Everyone who committed got the same price.")} <span data-no-i18n>${esc(tr("{tokens} for {usdc}").replace("{tokens}", `${fmtT(Number(i.bought) / 1e18)} $${m.symbol}`).replace("{usdc}", fmtU(i.total)))} · ${fmtP(i.bought > 0n ? Number(i.total) / 1e6 / (Number(i.bought) / 1e18) : 0)}</span></p>
        ${mine ? (i.claimed ? `<p class="q-ok">${T("Claimed")} <span data-no-i18n>${fmtT(Number(i.myTokens) / 1e18)} $${esc(m.symbol)}</span></p>` : `<div class="q-btns"><button type="button" class="bp-btn-primary" data-q="claim"${Q.busy ? " disabled" : ""}>${Q.busy === "claim" ? T("Claiming…") : `${T("Claim")} <span data-no-i18n>${fmtT(Number(i.myTokens) / 1e18)} $${esc(m.symbol)}</span>`}</button></div>`) : ""}
        <div class="q-btns"><a class="bp-btn-ghost" href="${coin}">${T("Open the coin")}</a></div>
        <p class="q-fine">${T("Contract")}: <a href="${EXPL()}/token/${i.token}" target="_blank" rel="noopener" data-no-i18n>${i.token.slice(0, 6)}…${i.token.slice(-4)}</a></p>`;
    } else {
      act = `<div class="q-act-h"><b>${T("Refunds are open")}</b></div>
        <p>${T("This launch didn't collapse, so every commit goes back.")}</p>
        <div class="q-btns">${mine ? `<button type="button" class="bp-btn-primary" data-q="refund"${Q.busy ? " disabled" : ""}>${T("Take back")} <span data-no-i18n>${fmtU(i.mine)}</span></button>` : `<span class="q-fine">${T("Nothing of yours is in it.")}</span>`}
        ${isCreator && !fr ? `<button type="button" class="bp-btn-ghost" data-q="refundFee"${Q.busy ? " disabled" : ""}>${T("Take back the launch fee")}</button>` : ""}</div>`;
    }
    const est = ph === 0 || ph === 3;
    return `<a class="q-back" href="#quantum">← ${T("Quantum launches")}</a>
      <div class="q-hero ph${ph}${Q.d.justCollapsed && !reduce ? " q-collapsing" : ""}">${orb(m, ph, true)}
        <div class="q-hd"><span class="q-chip ph${ph}">${T(PH[ph])}</span><h2 data-no-i18n>${esc(m.name)} <small>$${esc(m.symbol)}</small></h2>${m.desc ? `<p data-no-i18n>${esc(m.desc)}</p>` : ""}
          ${ph === 0 ? `<div class="q-count"><small>${T("Collapses in")}</small><b data-q-end="${i.ends}" data-no-i18n>${clock(left)}</b></div>` : ""}
          <div class="q-share"><button type="button" class="q-link-btn" data-q="copy">${T("Copy link")}</button><a class="q-link-btn" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(`$${m.symbol} is in superposition on ArcPad: commit before it collapses and everyone gets the same price. No snipers.`)}&url=${encodeURIComponent(page)}&via=ARCIRCLEonArc">${T("Share on X")}</a></div>
        </div></div>
      <div class="q-stats">
        <div><small>${T("Committed")}</small><b data-no-i18n>${fmtU(i.total)}</b></div>
        <div><small>${T("Wallets")}</small><b data-no-i18n>${i.n}</b></div>
        <div><small>${T(est ? "Everyone's price if it collapsed now" : "Everyone's price")}</small><b data-no-i18n>${fmtP(est ? e.avg : i.bought > 0n ? Number(i.total) / 1e6 / (Number(i.bought) / 1e18) : e.open)}</b></div>
        <div><small>${T(est ? "Market cap right after" : "Opening price")}</small><b data-no-i18n>${est ? "≈ $" + Math.round(e.mcapAfter).toLocaleString("en-US") : fmtP(e.open)}</b></div>
      </div>
      ${est && mine ? `<p class="q-yours">${T("If it collapsed now you'd get")} <b data-no-i18n>≈ ${fmtT(e.tokens * share)} $${esc(m.symbol)}</b> (${(share * 100).toFixed(1)}%)</p>` : ""}
      <div class="q-act">${act}${Q.msg ? `<p class="q-msg ${esc(Q.msg.k)}" role="status">${Q.msg.h}</p>` : ""}</div>
      <div class="q-how"><h3>${T("How a Quantum Launch works")}</h3><ol>
        <li><b>${T("Superposition")}</b><span>${T("The coin is announced but not tradeable. Anyone commits USDC — or takes it back — until the window ends.")}</span></li>
        <li><b>${T("Collapse")}</b><span>${T("One transaction launches the coin on ArcPad and buys with every commit at once. Its pool doesn't exist before that, so nobody can buy ahead.")}</span></li>
        <li><b>${T("Same price for all")}</b><span>${T("Each wallet gets the tokens in proportion to its USDC. A bot that committed first gets exactly the same price as you.")}</span></li>
      </ol><p class="q-fine">${T("If nobody collapses it within a day, or the creator calls it off, every commit goes back. No owner can touch the USDC. Coins can lose all of their value — this is not financial advice.")}</p></div>`;
  }
  async function paintDetail(force) {
    const host = $("q-body"), b = curFromHash();
    if (!host || !b) return;
    if (!PAD()) { host.innerHTML = ""; return paintList(); }
    if (force || !Q.d || Q.d.m.b !== b) { if (!Q.d || Q.d.m.b !== b) host.innerHTML = `<div class="q-empty"><span>${T("Reading the launch from Arc…")}</span></div>`; try { await loadDetail(b); } catch { host.innerHTML = `<div class="q-empty"><span>${T("That isn't a Quantum launch — or Arc didn't answer. Try again in a moment.")}</span><a class="bp-btn-ghost" href="#quantum">${T("All Quantum launches")}</a></div>`; return; } }
    if (curFromHash() !== b) return;
    const ae = document.activeElement, keep = ae && ae.id === "q-amt" ? ae.selectionStart : null;
    host.innerHTML = `<div class="q-detail">${detailHtml()}</div>`;
    if (keep != null) { const i = $("q-amt"); if (i) { i.focus(); try { i.setSelectionRange(keep, keep); } catch { /* fine */ } } }
    if (Q.d.justCollapsed) { Q.d.justCollapsed = false; if (typeof window.arcConfetti === "function" && !reduce) window.arcConfetti({ count: 60 }); }
  }
  function paint(force) { if (!active()) return; if (curFromHash()) paintDetail(force); else paintList(); }

  // ---------------- actions ----------------
  async function act(k) {
    const d = Q.d; if (!d || Q.busy) return;
    const b = d.m.b, say = (h, kind) => { Q.msg = { h, k: kind || "" }; paintDetail(); };
    if (k === "copy") { try { await navigator.clipboard.writeText(`${location.origin}/arc#quantum?b=${b}`); say(T("Link copied."), "ok"); } catch { /* no clipboard */ } return; }
    Q.busy = k; Q.msg = null; paintDetail();
    try {
      const s = await signer(), c = new ethers.Contract(b, B_ABI, s);
      let tx;
      if (k === "commit" || k === "uncommit") {
        const v = String(Q.amt || "").replace(/,/g, "").trim();
        if (!(Number(v) > 0)) throw new Error(tr("Enter an amount in USDC."));
        const raw = ethers.parseUnits(String(Number(Number(v).toFixed(6))), 6);
        if (k === "commit") {
          if (raw < 100000n) throw new Error(tr("The smallest commit is 0.10 USDC."));
          if (d.bal != null && raw > d.bal) throw new Error(tr("That's more USDC than this wallet has."));
          const u = new ethers.Contract(USDC, ERC, s);
          const al = await u.allowance(me(), b);
          if (al < raw) { say(T("Approve USDC for this launch in your wallet…")); Q.busy = k; const a = await u.approve(b, raw); await a.wait(); }
          say(T("Confirm the commit in your wallet…")); Q.busy = k;
          tx = await c.commit(raw);
        } else tx = await c.uncommit(raw > d.i.mine ? d.i.mine : raw);
      } else tx = await c[k]();
      say(`${T("Sent — waiting for Arc…")} <a href="${EXPL()}/tx/${tx.hash}" target="_blank" rel="noopener">tx ↗</a>`); Q.busy = k;
      const rc = await tx.wait();
      if (rc && rc.status === 0) throw new Error(tr("The transaction failed."));
      Q.amt = "";
      const done = { commit: "Committed.", uncommit: "Taken back.", collapse: "Collapsed — the coin is live.", claim: "Claimed.", refund: "Refunded.", refundFee: "The launch fee is back.", cancel: "Called off. Everyone can take their USDC back." }[k];
      Q.busy = ""; Q.list = null;
      await loadDetail(b);
      Q.msg = { h: `${T(done)} <a href="${EXPL()}/tx/${tx.hash}" target="_blank" rel="noopener">tx ↗</a>`, k: "ok" };
      if (k === "collapse" && Q.d.i.token) fetch("/api/tg-launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: Q.d.i.token }) }).catch(() => {});
      paintDetail();
    } catch (e) { Q.busy = ""; Q.msg = { h: esc(errText(e)), k: "bad" }; paintDetail(); }
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("#bp-panel-quantum [data-q]"); if (a && !a.disabled) { act(a.dataset.q); return; }
    const v = e.target.closest("#bp-panel-quantum [data-q-amt]");
    if (v) { const d = Q.d; Q.amt = v.dataset.qAmt === "max" ? (d && d.bal != null ? String(Math.floor(Number(d.bal) / 1e4) / 100) : "") : v.dataset.qAmt; const i = $("q-amt"); if (i) i.value = Q.amt; return; }
    if (e.target.closest("[data-q-start]")) { Q.on = true; setTimeout(paintMode, 100); }
  });
  document.addEventListener("input", (e) => { if (e.target.id === "q-amt") Q.amt = e.target.value; });

  // ---------------- Explore strip and the coin badge ----------------
  async function paintStrip() {
    const grid = $("ap-explore-grid"); if (!grid || !PAD()) return;
    let strip = $("q-strip");
    let rows = []; try { rows = (await loadList()).filter((r) => phase(r) === 0 || phase(r) === 3); } catch { /* next time */ }
    if (!rows.length) { if (strip) strip.remove(); return; }
    if (!strip) { strip = document.createElement("div"); strip.id = "q-strip"; strip.className = "q-strip"; grid.parentNode.insertBefore(strip, grid); }
    strip.innerHTML = `<div class="q-strip-h"><b>${T("Quantum launches in superposition")}</b><a href="#quantum">${T("See all")}</a></div><div class="q-strip-l">${rows.slice(0, 6).map((r) => `<a href="#quantum?b=${r.b}">${orb(r, phase(r))}<span><b data-no-i18n>$${esc(r.symbol)}</b><small data-no-i18n>${phase(r) === 0 ? `<span data-q-end="${r.ends}">${clock(r.ends - now())}</span>` : T("Ready to collapse")} · ${fmtU(r.total)}</small></span></a>`).join("")}</div>`;
  }
  async function badge() {
    const m = /^#coin\/(0x[0-9a-fA-F]{40})/.exec(location.hash); if (!m || !PAD()) return;
    const t = lc(m[1]);
    let b = Q.badge.get(t);
    if (b === undefined) { try { b = lc(await new ethers.Contract(PAD(), PAD_ABI, rp()).batchOfToken(t)); } catch { return; } if (/^0x0{40}$/.test(b)) b = ""; Q.badge.set(t, b); }
    const row = document.querySelector("#bp-panel-coin .ac2-name-row");
    const old = row && row.querySelector(".q-badge");
    if (!b) { if (old) old.remove(); return; }
    if (row && !old) row.insertAdjacentHTML("beforeend", `<a class="ac2-badge q-badge" href="#quantum?b=${b}" title="${T("Launched with Quantum Launch: everyone who committed got the same price")}">${T("Quantum launch")}</a>`);
  }

  // ---------------- wiring ----------------
  function route() {
    if (/^#quantum\b/.test(location.hash)) { if (!active() && typeof window.arcpadShowTab === "function") window.arcpadShowTab("quantum"); Q.msg = null; paint(true); }
    if (/^#explore\b|^#?$/.test(location.hash) || location.hash === "") paintStrip();
    if (/^#coin\//.test(location.hash)) [600, 2000, 4500, 8000].forEach((t) => setTimeout(badge, t));
  }
  // the coin header re-renders on every refresh and drops anything added to it, so badge after each render
  if (typeof apcRenderHeader === "function") {
    const origH = apcRenderHeader;
    apcRenderHeader = function () { origH.apply(this, arguments); try { badge(); } catch { /* ignore */ } };
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("arcpad:tab", (e) => { const t = e.detail && e.detail.tab; if (t === "quantum") paint(true); if (t === "explore") paintStrip(); if (t === "launch") setTimeout(paintMode, 50); if (t === "coin") [600, 2000].forEach((x) => setTimeout(badge, x)); });
  document.addEventListener("arcpad:launchframe", () => setTimeout(paintMode, 60));
  document.addEventListener("arc:lang", () => { paintMode(); paint(); });
  setInterval(() => {
    document.querySelectorAll("[data-q-end]").forEach((el) => { const left = Number(el.dataset.qEnd) - now(); el.textContent = clock(left); if (left <= 0 && active() && Q.d && phase(Q.d.i) === 0) paintDetail(); });
  }, 1000);
  setInterval(() => { if (document.hidden) return; if (active()) paint(true); else if ($("q-strip") || /^#explore/.test(location.hash)) { Q.list = null; paintStrip(); } }, 6000);
  setTimeout(() => { paintMode(); route(); }, 0);
  window.arcQuantum = { on, submit, estimate, paint, _Q: Q };
})();
