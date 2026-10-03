/* global CONFIG, ethers, state, connectWallet, ensureArcForWrite, WagmiCoreRef, wagmiConfigRef */
// arc-nft.js — ARCIRCLE NFT Vault (arcpad.html#nft; api/_nft.mjs; contracts/ArcircleNft.sol on Robinhood Chain):
//   · a coin's Pons creator fees go to the router: 50% the NFT Vault, 50% the treasury (anyone can trigger the split)
//   · the vault buys NFTs of listed collections (Seaport only) and raffles each one to $ARCIRCLE holders on Arc,
//     weighted by wallet $ARCIRCLE + locked in ARCIRCLE Staking + veARCIRCLE
//   · the page: the vault and its next NFT, the fee flow, your odds, every raffle, the collections, and the curator's
//     tools (list a collection, lower a cap, name the keeper) when the curator's wallet is connected
// Until the contracts are live (no vault from the API) the page explains it.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-nft");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const body = $("nft-body");
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const API = "/api/desk";
  const NC = (typeof CONFIG !== "undefined" && CONFIG.NFT) || {};
  const CHAIN = Number(NC.CHAIN_ID || 4663), CHAIN_HEX = "0x" + CHAIN.toString(16);
  const EXPL = (k, x) => `${NC.EXPLORER || "https://robinhoodchain.blockscout.com"}/${k}/${x}`;
  const ADD = { chainId: CHAIN_HEX, chainName: "Robinhood Chain", rpcUrls: [NC.RPC || "https://rpc.mainnet.chain.robinhood.com"], blockExplorerUrls: [NC.EXPLORER || "https://robinhoodchain.blockscout.com"], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } };
  const me = () => (typeof state !== "undefined" && state.account ? lc(state.account) : null);
  const fmt = (n, d = 2) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 }));
  const ethS = (n) => (n == null || !isFinite(n) ? "—" : fmt(n, n > 0 && n < 0.01 ? 5 : n < 1 ? 4 : 3) + " ETH");
  const big = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? fmt(n / 1e9, 2) + "B" : n >= 1e6 ? fmt(n / 1e6, 2) + "M" : n >= 1e3 ? fmt(n / 1e3, 1) + "K" : fmt(n, 2));
  const left = (s) => { s = Math.max(0, s); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
  const reduce = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const VAULT_ABI = ["function proposeCollection(address collection, uint128 maxPrice)", "function lowerCap(address collection, uint128 maxPrice)", "function removeCollection(address collection)", "function setKeeper(address next)",
    "error NotCurator()", "error NotAllowed()", "error ZeroAddress()"];
  const ROUTER_ABI = ["function claim() returns (uint256 toVault, uint256 toTreasury)", "error Reentered()", "error PayFailed(address to)"];
  const S = { st: null, me: null, busy: false, msg: {}, skew: 0, loaded: false, f: { col: "", cap: "", keeper: "" } };
  const PIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><circle cx="9" cy="9.5" r="1.8"/><path d="M4 17.5l4.6-4.4 3.4 3 3.2-3.6 4.8 5"/></svg>';

  // ---------------- data ----------------
  async function loadState() {
    try { const r = await fetch(`${API}?nft=state`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (j) { S.st = j; if (j.now) S.skew = j.now - Math.floor(Date.now() / 1000); } } catch { /* keep */ }
    S.loaded = true;
  }
  async function loadMe() {
    const u = me();
    if (!u || !S.st || !S.st.live) { S.me = null; return; }
    try { const r = await fetch(`${API}?nft=me&u=${u}`, { cache: "no-store" }); const j = r.ok ? await r.json() : null; if (j && j.live) S.me = j; } catch { /* keep */ }
  }
  async function refresh() { const prev = S.st && S.st.balance; await loadState(); await loadMe(); render(); grew(prev); }
  const live = () => !!(S.st && S.st.live);
  const nowS = () => Math.floor(Date.now() / 1000) + (S.skew || 0);

  // ---------------- view ----------------
  function head() {
    const st = S.st || {}, nx = st.next;
    const pct = nx && nx.price > 0 ? Math.min(1, (st.balance || 0) / nx.price) : 0;
    const img = nx && nx.image ? `<img src="${esc(nx.image)}" alt="" loading="lazy" decoding="async">` : `<span class="nft-ph">${PIC}</span>`;
    return `<section class="nft-hd">
      <div class="nft-vault"><small>${T("NFT Vault")}</small><b data-nft-bal data-no-i18n>${live() ? ethS(st.balance) : "—"}</b>
        <div class="nft-gauge" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct * 100)}"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>
        <span>${nx ? `<b data-no-i18n>${ethS(st.balance)} / ${ethS(nx.price)}</b> · <span data-no-i18n>${fmt(pct * 100, 1)}%</span> ${T(nx.cap ? "of the next NFT's price cap" : "of the next NFT")}` : T(live() ? "The first collection is being chosen — the vault fills meanwhile." : "Fills from trading fees once it's live")}</span></div>
      <div class="nft-next"><div class="nft-next-img">${img}</div><div class="nft-next-t"><small>${T("Next NFT")}</small>
        <b data-no-i18n>${nx ? esc((nx.title || nx.name || short(nx.collection)) + (nx.tokenId && !nx.title ? " #" + nx.tokenId : "")) : "—"}</b>
        <span>${nx ? (nx.cap ? T("Up to") + ` <b data-no-i18n>${ethS(nx.price)}</b>` : `<b data-no-i18n>${ethS(nx.price)}</b> · ${T("cheapest listing under the cap")}`) : T("Bought automatically when the vault can pay for it")}</span></div></div>
      <div class="nft-chips">${[
        ["Fees in", st.fees ? ethS(st.fees.total) : "—"],
        ["To the vault", st.fees ? ethS(st.fees.toVault) : "—"],
        ["To the treasury", st.fees ? ethS(st.fees.toTreasury) : "—"],
        ["NFTs bought", live() ? fmt(st.bought, 0) : "—"],
        ["NFTs won", live() ? fmt(st.won, 0) : "—"],
        ["In the draw", st.holders ? fmt(st.holders.count, 0) : "—"],
      ].map(([k, v]) => `<div class="nft-chip"><small>${T(k)}</small><b data-no-i18n>${v}</b></div>`).join("")}</div></section>`;
  }
  function flow() {
    const st = S.st || {}, coins = st.coins || [];
    const coin = coins.length ? coins.map((c) => `<a href="${EXPL("token", c.token)}" target="_blank" rel="noopener" data-no-i18n>$${esc(c.sym || short(c.token))}</a>`).join(" · ") : `<span>${T("CirclePad Round #3's coin")}</span>`;
    const steps = [[coin, "trades on Pons"], [esc(tr("Creator fees")), "fixed at launch"], [esc(tr("Router")), "50% vault · 50% treasury"], [esc(tr("NFT Vault")), "buys an NFT"], [esc(tr("Raffle")), "on-chain draw"], ["$ARCIRCLE", "a holder wins it"]];
    const pend = st.fees && st.fees.pending > 0 ? `<div class="nft-pend"><span>${T("Waiting at the router")}: <b data-no-i18n>${ethS(st.fees.pending)}</b></span><button type="button" class="nft-btn sm" data-nft-act="split"${st.router ? "" : " disabled"}>${T("Split it now")}</button></div>` : "";
    return `<section class="ams-card nft-card nft-flowc"><h3>${T("Where the ETH comes from")}</h3>
      <ol class="nft-flow">${steps.map(([a, b], i) => `<li style="--i:${i}"><b>${a}</b><small>${T(b)}</small></li>`).join("")}</ol>${pend}
      <p class="nft-msg ${S.msg.split ? S.msg.split.cls : ""}" aria-live="polite">${S.msg.split ? S.msg.split.h : ""}</p></section>`;
  }
  function oddsCard() {
    const m = S.me;
    let h = `<section class="ams-card nft-card nft-odds"><h3>${T("Your odds")}</h3>`;
    if (!me()) return h + `<p class="nft-note">${T("Connect the wallet that holds your $ARCIRCLE on Arc to see your weight in the draw.")}</p><button type="button" class="nft-btn go" data-nft-act="connect">${T("Connect wallet")}</button></section>`;
    if (!live()) return h + `<p class="nft-note">${T("Your odds show up here once the vault is live.")}</p></section>`;
    if (!m || !m.list) return h + `<p class="nft-note">${T("The first holder list is being built — check back shortly.")}</p></section>`;
    if (!m.inList) h += `<div class="nft-out"><b>${T("Not in the draw yet")}</b><span>${T("Hold or lock at least")} <b data-no-i18n>${fmt(m.minHold || 1000, 0)} $ARCIRCLE</b> ${T("in this wallet to be in the next list.")}</span></div>`;
    else {
      const parts = [["Held", m.held], ["Locked in Staking", m.locked], ["veARCIRCLE boost", m.ve]];
      const tot = m.weight || 1;
      h += `<div class="nft-chance"><div><small>${T("Chance per NFT")}</small><b data-no-i18n>${fmt(m.chance, m.chance < 1 ? 3 : 2)}%</b></div><div><small>${T("Your weight")}</small><b data-no-i18n>${big(m.weight)}</b></div></div>
        <div class="nft-wbar">${parts.map(([, v], i) => `<i class="p${i}" style="flex:${Math.max(0, v)}"></i>`).join("")}</div>
        <ul class="nft-wleg">${parts.map(([k, v], i) => `<li><i class="p${i}"></i><span>${T(k)}</span><b data-no-i18n>${big(v)}</b><em data-no-i18n>${fmt((v / tot) * 100, 0)}%</em></li>`).join("")}</ul>`;
    }
    h += `<p class="nft-note">${T("Locking in ARCIRCLE Staking counts your $ARCIRCLE and adds your veARCIRCLE on top — a max lock counts double.")} <a href="/arc#staking" data-arc-tab="staking">${T("ARCIRCLE Staking")} →</a></p>`;
    h += `<p class="nft-note sm">${T("List")}: <span data-no-i18n>${esc(m.list)}</span> · ${T("Arc block")} <span data-no-i18n>${fmt(m.block, 0)}</span> · <span data-no-i18n>${fmt(m.count, 0)}</span> ${T("wallets")}</p>`;
    if (m.won && m.won.length) h += `<div class="nft-won"><b>${T("You won")}</b>${m.won.map((w) => `<span data-no-i18n>${esc((w.name || "NFT") + " #" + w.tokenId)}</span>`).join("")}</div>`;
    return h + "</section>";
  }
  function statusOf(p) {
    const r = p.raffle, t = nowS();
    if (p.status === "won") return [`${T("Won by")} <a href="${EXPL("address", r.winner)}" target="_blank" rel="noopener" data-no-i18n>${short(r.winner)}${lc(r.winner) === me() ? ` (${esc(tr("you"))})` : ""}</a>`, "won"];
    if (p.status === "drawn") return [T("Drawn — sending it to the winner"), "drawn"];
    if (p.status === "open") return r.drawAfter > t ? [`${T("Draw in")} <b data-no-i18n data-nft-until="${r.drawAfter}">${left(r.drawAfter - t)}</b>`, "open"] : [T("Drawing…"), "drawing"];
    return [T("Holder snapshot next"), "held"];
  }
  function rafflesCard() {
    const ps = (S.st && S.st.prizes) || [];
    let h = `<section class="ams-card nft-card nft-raf"><h3>${T("Raffles")}</h3>`;
    if (!ps.length) return h + `<div class="nft-empty"><span class="nft-ph">${PIC}</span><span>${T("No NFT yet. The first one is bought when the vault can pay for it, and its raffle opens right after.")}</span></div></section>`;
    h += `<div class="nft-prizes">${ps.map((p) => {
      const [stt, cls] = statusOf(p);
      const img = p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async">` : `<span class="nft-ph">${PIC}</span>`;
      const r = p.raffle;
      return `<article class="nft-prize ${cls}" data-prize="${p.i}"><div class="nft-pimg">${img}<em>#${p.i}</em></div><div class="nft-pt">
        <b data-no-i18n>${esc(p.title || `${p.name || short(p.collection)} #${p.tokenId}`)}</b>
        <span>${p.donated ? T("Donated") : `${T("Bought for")} <b data-no-i18n>${ethS(p.paid)}</b>`}</span>
        <span class="nft-st ${cls}">${stt}</span>
        ${r ? `<span class="nft-pl">${r.holders != null ? `<span data-no-i18n>${fmt(r.holders, 0)}</span> ${T("wallets")} · ` : ""}${T("attempts")} <span data-no-i18n>${r.attempts}</span> · <a href="${API}?nft=list&prize=${p.i}" target="_blank" rel="noopener">${T("the list")} ↗</a></span>` : ""}
        <a class="nft-pl" href="${EXPL("token", p.collection)}" target="_blank" rel="noopener" data-no-i18n>${short(p.collection)} ↗</a></div></article>`;
    }).join("")}</div>`;
    return h + "</section>";
  }
  function collectionsCard() {
    const cs = (S.st && S.st.collections) || [], t = nowS();
    let h = `<section class="ams-card nft-card nft-cols"><h3>${T("Collections the vault buys")}</h3>`;
    if (!cs.length) h += `<p class="nft-note">${T("None listed yet. A collection becomes buyable 24 hours after it's listed, so everyone sees it first.")}</p>`;
    else h += `<ul class="nft-cl">${cs.map((c) => `<li class="${c.active ? "on" : c.listed ? "wait" : "off"}"><b data-no-i18n>${esc(c.name || short(c.address))}</b><a href="${EXPL("token", c.address)}" target="_blank" rel="noopener" data-no-i18n>${short(c.address)} ↗</a>
      <span>${T("Cap")} <b data-no-i18n>${ethS(c.maxPrice)}</b>${c.floor != null ? ` · ${T("floor")} <b data-no-i18n>${ethS(c.floor)}</b>` : ""}</span>
      <em>${c.active ? T("Buyable") : c.listed ? `${T("Buyable in")} <span data-no-i18n data-nft-until="${c.activeAt}">${left(c.activeAt - t)}</span>` : T("Removed")}</em></li>`).join("")}</ul>`;
    if (S.st && S.st.vault) h += `<p class="nft-note sm">${T("Vault")} <a href="${EXPL("address", S.st.vault)}" target="_blank" rel="noopener" data-no-i18n>${short(S.st.vault)} ↗</a>${S.st.router ? ` · ${T("Router")} <a href="${EXPL("address", S.st.router)}" target="_blank" rel="noopener" data-no-i18n>${short(S.st.router)} ↗</a>` : ""} · ${T("Robinhood Chain")}</p>`;
    return h + "</section>";
  }
  function curatorCard() {
    const st = S.st;
    if (!live() || !me() || lc(st.curator) !== me()) return "";
    const f = S.f, keeperHint = st.serverKeeper && lc(st.serverKeeper) !== lc(st.keeper) ? st.serverKeeper : "";
    return `<section class="ams-card nft-card nft-cur"><h3>${T("Curator")}</h3>
      <p class="nft-note">${T("Only this wallet sees this. Listing a collection (or raising its cap) takes 24 hours to apply; lowering a cap or removing one applies at once.")}</p>
      <label class="nft-f"><small>${T("Collection address")}</small><input id="nft-col" type="text" autocomplete="off" spellcheck="false" placeholder="0x…" value="${esc(f.col)}"></label>
      <label class="nft-f"><small>${T("Price cap")}</small><span class="nft-in"><input id="nft-cap" type="text" inputmode="decimal" autocomplete="off" placeholder="0.05" value="${esc(f.cap)}"><em data-no-i18n>ETH</em></span></label>
      <div class="nft-row"><button type="button" class="nft-btn go" data-nft-act="propose">${T("List / raise cap")}</button><button type="button" class="nft-btn" data-nft-act="lower">${T("Lower cap")}</button><button type="button" class="nft-btn" data-nft-act="remove">${T("Remove")}</button></div>
      <label class="nft-f"><small>${T("Keeper")} · ${T("now")} <span data-no-i18n>${short(st.keeper)}</span></small><input id="nft-keeper" type="text" autocomplete="off" spellcheck="false" placeholder="0x…" value="${esc(f.keeper || keeperHint)}"></label>
      ${keeperHint ? `<p class="nft-note sm">${T("The server's keeper wallet is")} <span data-no-i18n>${short(keeperHint)}</span> — ${T("name it so the raffles run on their own.")}</p>` : ""}
      <button type="button" class="nft-btn" data-nft-act="keeper">${T("Set keeper")}</button>
      <p class="nft-msg ${S.msg.cur ? S.msg.cur.cls : ""}" aria-live="polite">${S.msg.cur ? S.msg.cur.h : ""}</p></section>`;
  }
  function render() {
    if (!body) return;
    const ae = document.activeElement, focus = ae && ae.id && body.contains(ae) ? { id: ae.id, s: ae.selectionStart } : null;
    const pre = !S.loaded ? `<div class="nft-empty">…</div>` : !live() ? `<div class="nft-soon"><b>${T("Opens soon")}</b><span>${T("The NFT Vault contracts are being deployed on Robinhood Chain. Everything below shows how it will work.")}</span></div>` : "";
    body.innerHTML = `${pre}${head()}${flow()}<div class="nft-grid">${oddsCard()}${rafflesCard()}</div><div class="nft-grid">${collectionsCard()}${curatorCard()}</div>`;
    if (focus) { const el = $(focus.id); if (el) { el.focus(); try { el.setSelectionRange(focus.s, focus.s); } catch { /* fine */ } } }
  }
  function grew(prev) {
    if (prev == null || !S.st || !(S.st.balance > prev + 1e-9) || reduce()) return;
    const box = body.querySelector(".nft-vault");
    if (box) { box.classList.add("grew"); setTimeout(() => box.classList.remove("grew"), 1600); }
  }
  function tickClocks() {
    const t = nowS();
    body.querySelectorAll("[data-nft-until]").forEach((el) => { el.textContent = left(Number(el.dataset.nftUntil) - t); });
  }

  // ---------------- writes (Robinhood Chain) ----------------
  const walletProv = () => (typeof state !== "undefined" && state && state.walletProvider) || window.ethereum || null;
  const rejected = (e) => e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /reject|denied|cancel/i.test(String(e.message || e.shortMessage || "")));
  function holdChain(on) { if (on) { clearTimeout(holdChain.t); window.arcChainSwitching = true; } else holdChain.t = setTimeout(() => { window.arcChainSwitching = false; }, 4000); }
  async function rhSigner() {
    if ((typeof state === "undefined" || !state.account) && typeof connectWallet === "function") await connectWallet();
    if (!me()) throw new Error(tr("Connect a wallet first."));
    let done = false;
    if (typeof WagmiCoreRef !== "undefined" && WagmiCoreRef && typeof wagmiConfigRef !== "undefined" && wagmiConfigRef) {
      try { const acc = WagmiCoreRef.getAccount(wagmiConfigRef); if (acc && acc.isConnected) { if (Number(acc.chainId) !== CHAIN) await WagmiCoreRef.switchChain(wagmiConfigRef, { chainId: CHAIN, addEthereumChainParameter: ADD }); done = true; } } catch (e) { if (rejected(e)) throw e; }
    }
    const p = walletProv();
    if (!p) throw new Error(tr("Switch your wallet to Robinhood Chain and try again."));
    if (!done && Number.parseInt(await p.request({ method: "eth_chainId" }), 16) !== CHAIN) {
      try { await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] }); }
      catch (e) { if (rejected(e)) throw e; await p.request({ method: "wallet_addEthereumChain", params: [ADD] }); await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] }).catch(() => {}); }
    }
    const bp = new ethers.BrowserProvider(p, "any");
    for (let i = 0; i < 6; i++) { if (Number((await bp.getNetwork()).chainId) === CHAIN) return bp.getSigner(me()); await new Promise((r) => setTimeout(r, 500)); }
    throw new Error(tr("Your wallet is still on another network — switch it to Robinhood Chain and try again."));
  }
  const errText = (e) => {
    if (rejected(e)) return tr("Cancelled in your wallet.");
    const s = String((e && e.revert && e.revert.name) || (e && (e.shortMessage || e.reason || e.message)) || "");
    const map = { NotCurator: "Only the curator's wallet can do that.", NotAllowed: "That collection isn't listed (or the new cap isn't lower).", ZeroAddress: "Enter an address.", insufficient: "Not enough ETH on Robinhood Chain for gas." };
    for (const k of Object.keys(map)) if (s.includes(k)) return tr(map[k]);
    return (s || tr("The transaction didn't go through.")).slice(0, 180);
  };
  const say = (k, h, cls = "") => { S.msg[k] = { h, cls }; const el = body.querySelector(k === "split" ? ".nft-flowc .nft-msg" : ".nft-cur .nft-msg"); if (el) { el.className = "nft-msg " + cls; el.innerHTML = h; } };
  async function run(k, fn) {
    if (S.busy) return;
    S.busy = true;
    holdChain(true);
    try {
      const sg = await rhSigner();
      say(k, T("Confirm in your wallet…"));
      const tx = await fn(sg);
      say(k, T("Confirming…"));
      await tx.wait();
      say(k, `${T("Done")} · <a href="${EXPL("tx", tx.hash)}" target="_blank" rel="noopener" data-no-i18n>${short(tx.hash)} ↗</a>`, "ok");
      await refresh();
    } catch (e) { say(k, esc(errText(e)), "err"); }
    finally { S.busy = false; holdChain(false); try { if (typeof ensureArcForWrite === "function") await ensureArcForWrite(); } catch { /* stays on Robinhood Chain */ } }
  }
  function act(a) {
    if (a === "connect") { if (typeof connectWallet === "function") connectWallet().then(refresh).catch(() => {}); return; }
    if (!live()) return;
    const V = S.st.vault;
    if (a === "split") return run("split", (sg) => new ethers.Contract(S.st.router, ROUTER_ABI, sg).claim());
    const col = String(S.f.col || "").trim(), cap = String(S.f.cap || "").trim(), keeper = String(S.f.keeper || "").trim() || (S.st.serverKeeper || "");
    const bad = (m) => say("cur", T(m), "err");
    if (a === "propose" || a === "lower") {
      if (!isAddr(col)) return bad("Enter the collection's contract address.");
      if (!(Number(cap) > 0)) return bad("Enter a price cap in ETH.");
      const w = ethers.parseEther(cap);
      return run("cur", (sg) => new ethers.Contract(V, VAULT_ABI, sg)[a === "propose" ? "proposeCollection" : "lowerCap"](col, w));
    }
    if (a === "remove") { if (!isAddr(col)) return bad("Enter the collection's contract address."); return run("cur", (sg) => new ethers.Contract(V, VAULT_ABI, sg).removeCollection(col)); }
    if (a === "keeper") { if (!isAddr(keeper)) return bad("Enter the keeper's address."); return run("cur", (sg) => new ethers.Contract(V, VAULT_ABI, sg).setKeeper(keeper)); }
  }
  body.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-nft-act]");
    if (b && !b.disabled) act(b.dataset.nftAct);
  });
  body.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "nft-col") S.f.col = t.value; else if (t.id === "nft-cap") S.f.cap = t.value; else if (t.id === "nft-keeper") S.f.keeper = t.value;
  });

  // ---------------- life ----------------
  let timer = null, clock = null, acct = null;
  async function tick() {
    if (S.busy) return;
    const ae = document.activeElement, typing = ae && body.contains(ae) && /INPUT|SELECT/.test(ae.tagName);
    if (me() !== acct) { acct = me(); await loadMe(); if (!typing) render(); return; }
    if (!typing) await refresh();
  }
  function show() {
    if (!S.booted) { S.booted = true; render(); acct = me(); refresh(); }
    clearInterval(timer); clearInterval(clock);
    timer = setInterval(tick, 20000);
    clock = setInterval(tickClocks, 1000);
    setTimeout(tick, 2500);
  }
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "nft") show(); else { clearInterval(timer); clearInterval(clock); } });
  document.addEventListener("arc:lang", () => { if (S.booted) render(); });
  const lede = panel.querySelector(".nft-hero .bp-lede");
  if (lede) lede.addEventListener("click", () => lede.classList.toggle("open"));
  if (window.matchMedia && window.matchMedia("(max-width: 560px)").matches) panel.querySelectorAll(".nft-guide details[open]").forEach((d) => d.removeAttribute("open"));
  if (panel.classList.contains("active")) show();
  window.arcNft = { get state() { return S; }, refresh };
})();
