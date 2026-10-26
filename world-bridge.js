// world-bridge.js — "Bring USDC to Arc" inside ARCIRCLE WORLD (the owner, 2026-10-26: Arc Studio / App Kit ideas —
// pay with USDC from any chain). The same route as ArcPad's Bridge (arc-bridge.js, Circle's CCTP V2) without ethers:
//   1. switch the wallet to the chain the USDC is on; approve the TokenMessenger if needed
//   2. depositForBurnWithHook with the "cctp-forward" hook: Circle's Forwarding Service mints on Arc, so the player
//      needs no gas on Arc (Arc's gas is USDC, and a player with none couldn't mint it themselves)
//   3. Circle signs (Iris, through /api/social?cctp=msg) and delivers; the window watches the Arc balance grow
// Transfers are kept in the same localStorage list as ArcPad's Bridge ("arcircle.bridge.v1"), so either page shows
// them. Inbound only (other chains → Arc): the game spends USDC on Arc.
const STORE = "arcircle.bridge.v1";
const HOOK = "636374702d666f72776172640000000000000000000000000000000000000000"; // "cctp-forward", version 0
const ZERO32 = "0".repeat(64);
const SEL = { bal: "0x70a08231", allow: "0xdd62ed3e", approve: "0x095ea7b3", burnHook: "0x779b432d" };
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const STD_ETA = { ethereum: "15–20 min", base: "15–20 min", arbitrum: "15–20 min", optimism: "15–20 min", unichain: "15–20 min", linea: "6–32 h", polygon: "~8 min", avalanche: "< 1 min", sonic: "< 1 min", worldchain: "15–20 min", monad: "< 1 min", sei: "< 1 min", hyperevm: "< 1 min", ink: "~30 min" };
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const hexN = (n) => BigInt(n).toString(16);
const fmt = (u) => { const n = Number(u) / 1e6; return n >= 100 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toLocaleString("en-US", { maximumFractionDigits: 4 }); };
const units = (v) => { const s = String(v || "").trim(); if (!/^\d*\.?\d{0,6}$/.test(s) || s === "" || s === ".") return 0n; const [a, b = ""] = s.split("."); return BigInt(a || "0") * 1000000n + BigInt((b + "000000").slice(0, 6)); };
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

export function makeBridge(ctx) {
  const { T, esc } = ctx, CFG = ctx.config() || {}, B = CFG.BRIDGE;
  if (!B || !Array.isArray(B.CHAINS)) return null;
  const ARC = { key: "arc", name: "Arc", chainId: CFG.CHAIN_ID_DECIMAL || 5042, domain: B.ARC_DOMAIN, usdc: ARC_USDC, rpc: CFG.RPC_URL, explorer: CFG.BLOCK_EXPLORER };
  const CHAINS = B.CHAINS, byKey = (k) => (k === "arc" ? ARC : CHAINS.find((c) => c.key === k) || null);
  let el = null, src = "", speed = "fast", bal = {}, gas = {}, arcBal = null, busy = false, need = 0n, stepOn = "", stepDone = [], msg = "", msgK = "", tick = 0;
  const who = () => String(ctx.address() || "").toLowerCase();
  async function rpc(c, method, params) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
    try { const r = await fetch(c.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: ctl.signal }); const j = await r.json(); if (j.error) throw new Error(j.error.message || "rpc"); return j.result; } finally { clearTimeout(t); }
  }
  const usdcOf = async (c, a) => BigInt((await rpc(c, "eth_call", [{ to: c.usdc, data: SEL.bal + pad(a) }, "latest"])) || "0x0");
  async function fees(c) { const r = await fetch(`/api/social?cctp=fees&src=${c.domain}&dst=${ARC.domain}`); const j = await r.json().catch(() => ({})); if (!j.fees) throw new Error(j.error || T("Couldn't get a fee quote from Circle")); return j.fees; }
  // the same fee maths as ArcPad's Bridge: Circle takes at most maxFee out of the amount
  function quote(amount, rows, sp) {
    const thr = sp === "fast" ? 1000 : 2000, row = rows.find((r) => r.finalityThreshold === thr) || rows.find((r) => r.finalityThreshold === 2000); if (!row) return null;
    const bps = BigInt(Math.round((row.minimumFee || 0) * 1000)), proto = bps > 0n ? (amount * bps + 9999999n) / 10000000n : 0n, protoMax = proto > 0n ? (proto * 5n) / 4n + 1n : 0n;
    const fw = row.forwardFee, fwdEst = fw && fw.high > 0 ? BigInt(Math.ceil(fw.med || fw.high)) : 0n, fwdMax = fw && fw.high > 0 ? BigInt(Math.ceil(fw.high * 1.1)) : 0n;
    return { thr: row.finalityThreshold, maxFee: protoMax + fwdMax, recvEst: amount - proto - fwdEst, recvMin: amount - protoMax - fwdMax };
  }
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; } };
  const save = (rec) => { try { localStorage.setItem(STORE, JSON.stringify([rec, ...load().filter((x) => x.id !== rec.id)].slice(0, 30))); } catch { /* private mode: this visit only */ } };
  const mine = () => load().filter((r) => r.dst === "arc" && String(r.recipient || "").toLowerCase() === who()).slice(0, 5);
  async function provider() { const p = await ctx.provider(); if (!p) throw new Error(T("No wallet found.")); return p; }
  async function switchTo(c) {
    const p = await provider(), id = "0x" + c.chainId.toString(16);
    if (Number.parseInt(await p.request({ method: "eth_chainId" }), 16) === c.chainId) return;
    try { await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: id }] }); }
    catch (e) { if (e && e.code === 4001) throw e; await p.request({ method: "wallet_addEthereumChain", params: [{ chainId: id, chainName: c.name, rpcUrls: [c.rpc], blockExplorerUrls: [c.explorer], nativeCurrency: c.native }] }); await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: id }] }).catch(() => {}); }
    if (Number.parseInt(await p.request({ method: "eth_chainId" }), 16) !== c.chainId) throw new Error(T("Switch your wallet to {c} and try again.", { c: c.name }));
  }
  async function send(c, to, data) { const p = await provider(); return p.request({ method: "eth_sendTransaction", params: [{ from: ctx.address(), to, data }] }); }
  async function mined(c, tx) { for (let i = 0; i < 150; i++) { const r = await rpc(c, "eth_getTransactionReceipt", [tx]).catch(() => null); if (r) return r.status === "0x1"; await sleep(3000); } return null; }
  const errText = (e) => { if (e && e.code === 4001) return T("You cancelled in your wallet."); const m = String((e && (e.message || e.reason)) || e || ""); return /insufficient funds/i.test(m) ? T("Not enough gas on this chain for the transaction.") : m.slice(0, 180) || T("Something went wrong."); };

  async function readAll() {
    const a = who(); if (!a) return;
    usdcOf(ARC, a).then((v) => { arcBal = v; paint(); }).catch(() => {});
    await Promise.all(CHAINS.map(async (c) => { try { bal[c.key] = await usdcOf(c, a); } catch { bal[c.key] = null; } }));
    if (!src) { const best = CHAINS.filter((c) => bal[c.key] > 0n).sort((x, y) => (bal[y.key] > bal[x.key] ? 1 : -1))[0]; src = (best || CHAINS.find((c) => c.key === "base") || CHAINS[0]).key; }
    paint(); gasOf(byKey(src));
  }
  async function gasOf(c) { if (!c || gas[c.key] !== undefined) return; gas[c.key] = null; try { gas[c.key] = BigInt((await rpc(c, "eth_getBalance", [who(), "latest"])) || "0x0"); } catch { gas[c.key] = null; } paint(); }

  let q = null, qFor = "";
  async function requote() {
    const c = byKey(src), amt = amount(); if (!c || !amt) { q = null; paint(); return; }
    const k = src + ":" + speed + ":" + amt; qFor = k;
    try { const r = quote(amt, await fees(c), c.fast === false ? "std" : speed); if (qFor === k) { q = r; paint(); } } catch (e) { if (qFor === k) { q = null; msg = errText(e); msgK = "err"; paint(); } }
  }
  const amount = () => (el ? units(el.__v || "") : 0n);

  async function go() {
    if (busy) return; const c = byKey(src), amt = amount(); if (!c || !amt) return;
    if (!ctx.address()) { ctx.signIn(); return; }
    busy = true; stepDone = []; msg = ""; const a = ctx.address();
    try {
      step("switch"); await switchTo(c); stepDone.push("switch");
      const fq = quote(amt, await fees(c), c.fast === false ? "std" : speed); if (!fq || fq.recvMin <= 0n) throw new Error(T("The amount doesn't cover Circle's fees."));
      const have = await usdcOf(c, a); if (have < amt) throw new Error(T("Not enough USDC on {c}.", { c: c.name }));
      step("approve");
      const allow = BigInt((await rpc(c, "eth_call", [{ to: c.usdc, data: SEL.allow + pad(a) + pad(B.TOKEN_MESSENGER) }, "latest"])) || "0x0");
      if (allow < amt) { say(T("Approve USDC in your wallet…")); const ap = await send(c, c.usdc, SEL.approve + pad(B.TOKEN_MESSENGER) + pad(hexN(amt))); say(T("Approving…")); if ((await mined(c, ap)) === false) throw new Error(T("The approval failed.")); }
      stepDone.push("approve"); step("burn"); say(T("Confirm the transfer in your wallet…"));
      let arc0 = null; try { arc0 = (await usdcOf(ARC, a)).toString(); } catch { /* the delivery check reads it later */ }
      // depositForBurnWithHook(amount, Arc's domain, you on Arc, USDC here, anyone may relay, maxFee, finality, the forwarding hook)
      const data = SEL.burnHook + pad(hexN(amt)) + pad(hexN(ARC.domain)) + pad(a) + pad(c.usdc) + ZERO32 + pad(hexN(fq.maxFee)) + pad(hexN(fq.thr)) + pad(hexN(256)) + pad(hexN(32)) + HOOK;
      const tx = await send(c, B.TOKEN_MESSENGER, data);
      const rec = { id: tx, tx, src: c.key, dst: "arc", amount: amt.toString(), maxFee: fq.maxFee.toString(), recipient: a, forward: true, speed: fq.thr === 1000 ? "fast" : "standard", at: Date.now(), dstBal0: arc0, stage: "burning", from: "world" };
      save(rec); say(T("Sent — burning on {c}…", { c: c.name }));
      const ok = await mined(c, tx); rec.stage = ok === false ? "failed" : "burned"; save(rec);
      if (ok === false) throw new Error(T("The burn transaction failed — your USDC didn't move."));
      stepDone.push("burn"); step("sign"); say(T("Circle is signing it — you can close this window, it carries on."), "ok");
      try { if (ctx.log) ctx.log("bridge sent " + c.key + " " + fmt(amt)); } catch { /* fine */ }
      try { await switchTo(ARC); } catch { /* the game asks for Arc again when it needs it */ }
      watch(rec);
    } catch (e) { say(errText(e), "err"); step(""); try { if (ctx.log) ctx.log("bridge failed: " + errText(e)); } catch { /* fine */ } }
    finally { busy = false; paint(); }
  }
  // a transfer's progress: Circle's attestation, then the mint on Arc (the Arc balance grows past what it was)
  async function watch(rec) {
    const c = byKey(rec.src); if (!c) return;
    for (let i = 0; i < 400 && !rec.delivered; i++) {
      if (!rec.attested) { try { const j = await (await fetch(`/api/social?cctp=msg&src=${c.domain}&tx=${rec.tx}`)).json(); const m = j && j.messages && j.messages[0]; if (m && (m.status === "complete" || m.attestation)) { rec.attested = true; save(rec); if (el && stepOn === "sign") { stepDone.push("sign"); step("arc"); } } if (m && m.forwardTx) { rec.forwardTx = m.forwardTx; rec.delivered = true; } } catch { /* asked again */ } }
      if (!rec.delivered && rec.dstBal0 != null) { try { const now = await usdcOf(ARC, rec.recipient); if (now > BigInt(rec.dstBal0)) rec.delivered = true; } catch { /* asked again */ } }
      if (rec.delivered) { save(rec); arcBal = null; usdcOf(ARC, rec.recipient).then((v) => { arcBal = v; paint(); }).catch(() => {}); if (el) { stepDone = ["switch", "approve", "burn", "sign", "arc"]; step(""); say(T("Your USDC arrived on Arc!"), "ok"); fx(); } ctx.toast("💙 " + esc(T("Your USDC arrived on Arc"))); if (ctx.onArrive) ctx.onArrive(); return; }
      await sleep(i < 40 ? 5000 : 15000);
    }
  }
  function step(k) { stepOn = k; paint(); }
  function say(t, k = "wait") { msg = t; msgK = k; paint(); }
  function fx() { if (!el || ctx.reduce) return; const b = document.createElement("i"); b.className = "wbr-burst"; el.querySelector(".wbr-in").appendChild(b); setTimeout(() => b.remove(), 1400); }

  const STEPS = [["switch", "Switch network"], ["approve", "Approve USDC"], ["burn", "Send"], ["sign", "Circle signs"], ["arc", "On Arc"]];
  function paint() {
    if (!el) return;
    const c = byKey(src), amt = amount(), list = mine(), g = c ? gas[c.key] : null, haveC = c ? bal[c.key] : null;
    const chips = CHAINS.map((x) => { const v = bal[x.key]; return `<button type="button" class="wbr-ch${x.key === src ? " on" : ""}${v === 0n ? " zero" : ""}" data-src="${x.key}" style="--c:${x.color || "#35d8d0"}"><i></i><b>${esc(x.name)}</b><small>${v == null ? (v === null ? "—" : "…") : fmt(v)}</small></button>`; }).join("");
    const fastOk = c && c.fast !== false;
    el.querySelector(".wbr-body").innerHTML = `
      <div class="wbr-arc"><span>${esc(T("Your USDC on Arc"))}</span><b>${arcBal == null ? "…" : fmt(arcBal)}</b>${need > 0n ? `<em>${esc(T("Needed: {n} USDC", { n: fmt(need) }))}</em>` : ""}</div>
      <h4>${esc(T("From"))}</h4><div class="wbr-chs">${chips}</div>
      <div class="wbr-amt"><input data-amt inputmode="decimal" placeholder="0.00" aria-label="${esc(T("Amount in USDC"))}" value="${el.__v || ""}"><span>USDC</span><button type="button" data-max ${haveC ? "" : "disabled"}>${esc(T("Max"))}</button></div>
      <div class="wbr-quick">${[10, 25, 50, 100].map((n) => `<button type="button" data-q="${n}">${n}</button>`).join("")}</div>
      <div class="wbr-sp"><button type="button" data-sp="fast" class="${speed === "fast" && fastOk ? "on" : ""}" ${fastOk ? "" : "disabled"}>⚡ ${esc(T("Fast"))}<small>${esc(T("about a minute · small fee"))}</small></button><button type="button" data-sp="std" class="${speed !== "fast" || !fastOk ? "on" : ""}">🐢 ${esc(T("Standard"))}<small>${esc(c ? STD_ETA[c.key] || "15–20 min" : "")} · ${esc(T("lower fee"))}</small></button></div>
      <p class="wbr-q">${amt && q ? `${esc(T("You get about {n} USDC on Arc", { n: fmt(q.recvEst > 0n ? q.recvEst : 0n) }))} <small>${esc(T("Circle's fee at most {f} USDC", { f: fmt(q.maxFee) }))}</small>` : amt ? "…" : esc(T("Pick a chain and an amount."))}</p>
      ${g === 0n && c ? `<p class="wbr-warn">⛽ ${esc(T("You need a little {g} on {c} to pay for the two transactions there.", { g: (c.native && c.native.symbol) || "gas", c: c.name }))}</p>` : ""}
      ${haveC != null && amt > haveC ? `<p class="wbr-warn">${esc(T("Not enough USDC on {c}.", { c: c ? c.name : "" }))}</p>` : ""}
      <button type="button" class="wbr-go" data-go ${busy || !amt || (haveC != null && amt > haveC) ? "disabled" : ""}>${busy ? esc(T("Working…")) : ctx.address() ? `💙 ${esc(T("Bring it to Arc"))}` : esc(T("Connect your wallet"))}</button>
      <ol class="wbr-steps${stepOn || stepDone.length ? " show" : ""}">${STEPS.map(([k, l]) => `<li class="${stepOn === k ? "on" : ""}${stepDone.includes(k) ? " done" : ""}"><i></i>${esc(T(l))}</li>`).join("")}</ol>
      ${msg ? `<p class="wbr-msg ${msgK}">${esc(msg)}</p>` : ""}
      ${list.length ? `<h4>${esc(T("Your transfers"))}</h4><ul class="wbr-list">${list.map((r) => { const s0 = byKey(r.src); return `<li class="${r.delivered ? "ok" : r.stage === "failed" ? "bad" : "wait"}"><b>${fmt(BigInt(r.amount || 0))} USDC</b><span>${esc(s0 ? s0.name : r.src)} → Arc</span><em>${esc(T(r.delivered ? "Arrived" : r.stage === "failed" ? "Failed" : r.attested ? "Delivering" : "On its way"))}</em>${s0 ? `<a href="${s0.explorer}/tx/${esc(r.tx)}" target="_blank" rel="noopener">tx ↗</a>` : ""}</li>`; }).join("")}</ul>` : ""}
      <p class="wbr-fine">${esc(T("Circle's CCTP moves native USDC: it's burned on the chain you pick and minted to your own wallet on Arc. Circle delivers it, so you need no gas on Arc."))}</p>`;
  }
  function onClick(e) {
    const b = e.target.closest("button"); if (!b || !el) return;
    if (b.hasAttribute("data-x")) return close();
    if (b.dataset.src) { src = b.dataset.src; q = null; gasOf(byKey(src)); paint(); requote(); return; }
    if (b.dataset.q) { el.__v = b.dataset.q; paint(); requote(); return; }
    if (b.hasAttribute("data-max")) { const v = bal[src]; if (v) { el.__v = (Number(v) / 1e6).toFixed(6).replace(/\.?0+$/, ""); paint(); requote(); } return; }
    if (b.dataset.sp) { speed = b.dataset.sp === "fast" ? "fast" : "std"; paint(); requote(); return; }
    if (b.hasAttribute("data-go")) { go(); }
  }
  function onInput(e) { if (e.target.matches("[data-amt]")) { el.__v = e.target.value; clearTimeout(tick); tick = setTimeout(requote, 350); const go0 = el.querySelector("[data-go]"); if (go0) go0.disabled = busy || !amount(); } }
  function open(opt = {}) {
    if (el) return; need = opt.need ? BigInt(Math.ceil(opt.need)) : 0n;
    el = document.createElement("div"); el.className = "wbr"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
    el.innerHTML = `<div class="wbr-in"><div class="wbr-hd"><small>ARC · CCTP</small><h3>💙 ${esc(T("Bring USDC to Arc"))}</h3><p>${esc(T("USDC on another chain? Move it to your wallet on Arc in a minute — then spend it in the game."))}</p><button type="button" class="wbr-x" data-x aria-label="${esc(T("Close"))}">×</button></div><div class="wbr-body"></div></div>`;
    if (need > 0n && arcBal != null && need > arcBal) el.__v = (Number(need - arcBal) / 1e6 + 0.5).toFixed(2);
    el.addEventListener("click", (e) => { if (e.target === el) close(); else onClick(e); }); el.addEventListener("input", onInput);
    document.body.appendChild(el); ctx.onOpen && ctx.onOpen(); paint(); readAll().then(() => { if (need > 0n && arcBal != null && need > arcBal && !el.__v) el.__v = (Number(need - arcBal) / 1e6 + 0.5).toFixed(2); paint(); requote(); });
    for (const r of mine()) if (!r.delivered && r.stage !== "failed" && Date.now() - r.at < 2 * 86400e3) watch(r);
  }
  function close() { if (!el) return; el.remove(); el = null; ctx.onClose && ctx.onClose(); }
  /// the player's USDC on Arc in its 6-decimal units (null when it can't be read)
  async function arcUsdc() { const a = who(); if (!a) return null; try { return await usdcOf(ARC, a); } catch { return null; } }
  return { open, close, shown: () => !!el, arcUsdc };
}
