/* global CONFIG, renderArcpadExploreGrid, fmtUsd, actAgo, ARC */
// arc-pump.js — "Launch on Pump.fun" through ArcPad (Solana), and those coins in Explore.
//
// The launch form's platform switch (arc-argus.js) has a fourth choice, Pump.fun. It launches an ordinary Pump.fun coin
// (create_v2: a bonding curve in SOL that graduates to PumpSwap) from the creator's own Solana wallet — Phantom, Solflare, MetaMask
// or Backpack; the Arc wallet isn't involved. The only ArcPad part is the coin's creator fees: they're shared through
// Pump.fun's own fee-sharing program, create_fee_sharing_config then update_fee_shares_v2 with [creator 70%, ARCIRCLE PAD
// treasury 30%]. update_fee_shares_v2 revokes the config's admin, so the split is fixed for the life of the coin.
//   1. read Pump.fun (its Global and fee config) through ArcPad's Solana relay; host the coin's metadata JSON
//   2. build the launch and the split (vendor/pump-kit.js: the official @pump-fun/pump-sdk), sign both in one prompt
//   3. send them in order, wait for each to confirm
//   4. report it to /api/social (pumpreg), which checks the split on chain and lists it in Explore
// A launch whose split didn't land is kept in this browser and finished from the resume card.
// Support (Dexscreener info at $20K, marketing at $100K, refused on manipulation) is ARCIRCLE PAD's own policy.
(function () {
  "use strict";
  const P = typeof CONFIG !== "undefined" && CONFIG.PUMP;
  const panel = document.getElementById("bp-panel-launch");
  const fields = document.getElementById("pmp-fields");
  if (!P || !panel || !fields) return;

  // ---------------- basics ----------------
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const isMint = (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(a || ""));
  const short = (a) => (a ? `${String(a).slice(0, 4)}…${String(a).slice(-4)}` : "—");
  const usd = (n) => (n == null || !isFinite(n) ? "—" : typeof fmtUsd === "function" ? fmtUsd(n) : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const solS = (lam, d) => (Number(lam) / 1e9).toLocaleString("en-US", { maximumFractionDigits: d == null ? 4 : d });
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TREASURY = String(P.TREASURY || "");
  const PLATFORM_BPS = P.PLATFORM_BPS || 3000;
  const SUP = P.SUPPORT || { DEX_INFO_MCAP: 20000, MARKETING_MCAP: 100000 };
  const APP = (m) => `${P.APP || "https://pump.fun/coin"}/${m}`;
  const SCAN = (kind, x) => `${P.EXPLORER || "https://solscan.io"}/${kind}/${x}`;
  const RENT_EST = 0.03; // SOL: the mint, curve, metadata and sharing-config accounts plus network fees, roughly
  const ready = () => isMint(TREASURY);

  // ---------------- the kit (vendor/pump-kit.js), loaded on first use ----------------
  let kitP = null;
  function kit() {
    if (window.ArcPumpKit) return Promise.resolve(window.ArcPumpKit);
    if (kitP) return kitP;
    kitP = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = P.KIT || "/vendor/pump-kit.js"; s.async = true;
      s.onload = () => (window.ArcPumpKit ? res(window.ArcPumpKit) : rej(new Error("the Solana kit didn't load")));
      s.onerror = () => { kitP = null; rej(new Error(tr("Couldn't load the Solana kit — check your connection and try again."))); };
      document.head.appendChild(s);
    });
    return kitP;
  }
  let connP = null;
  const conn = () => (connP = connP || kit().then((K) => new K.Connection(new URL(P.RPC || "/api/social?solrpc=1", location.origin).href, { commitment: "confirmed", disableRetryOnRateLimit: true })));

  // ---------------- the Solana wallet (arc-solwallet.js: shared with the wallet menu's Solana choice) ----------------
  const W = window.arcSol || { p: null, name: "", key: "", providers: () => [], connect: async () => false, quiet: async () => false, disconnect: async () => {} };
  const providers = () => W.providers();
  async function connect(i) {
    try { return await W.connect(i); } catch (e) { throw new Error(/share an address/.test(String(e && e.message)) ? tr("The wallet didn't share an address.") : (e && e.message) || String(e)); }
  }
  const quietConnect = () => W.quiet();
  const disconnect = () => W.disconnect();
  document.addEventListener("arc:solwallet", () => { if (active()) { paintWallet(); balance(); resume(); } });
  const mobile = () => (W.mobile ? W.mobile() : /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ""));
  function paintWallet() {
    const box = $("pmp-wallet");
    if (!box) return;
    if (W.key) {
      box.className = "pmp-wallet on";
      box.innerHTML = `<i aria-hidden="true"></i><span><small>${T("Solana wallet")} · ${esc(W.name)}</small><b data-no-i18n>${esc(short(W.key))}</b></span><button type="button" class="ams-mini" data-pmp-off>${T("Disconnect")}</button>`;
      return;
    }
    const list = providers();
    box.className = "pmp-wallet";
    if (list.length) {
      box.innerHTML = `<span><small>${T("Solana wallet")}</small><b>${T("Not connected")}</b></span><div class="pmp-wallet-btns">${list.map((x, i) => `<button type="button" class="ams-mini" data-pmp-conn="${i}">${esc(tr("Connect {w}").replace("{w}", x.name))}</button>`).join("")}</div>`;
    } else {
      const here = encodeURIComponent(location.href), ref = encodeURIComponent(location.origin);
      box.innerHTML = `<span><small>${T("Solana wallet")}</small><b>${T(mobile() ? "Open this page in a Solana wallet's browser" : "No Solana wallet found in this browser")}</b></span><div class="pmp-wallet-btns">` +
        (mobile()
          ? ["Phantom", "Solflare", "MetaMask"].map((w) => `<a class="ams-mini" href="${esc(W.openIn ? W.openIn(w) : "")}">${esc(tr("Open in {w}").replace("{w}", w))}</a>`).join("")
          : `<a class="ams-mini" href="https://phantom.com/download" target="_blank" rel="noopener">${esc(tr("Get {w}").replace("{w}", "Phantom"))} ↗</a><a class="ams-mini" href="https://solflare.com/download" target="_blank" rel="noopener">${esc(tr("Get {w}").replace("{w}", "Solflare"))} ↗</a><a class="ams-mini" href="https://metamask.io/download" target="_blank" rel="noopener">${esc(tr("Get {w}").replace("{w}", "MetaMask"))} ↗</a>`) + `</div>`;
    }
  }
  fields.addEventListener("click", async (e) => {
    const c = e.target.closest("[data-pmp-conn]");
    if (c) { try { await connect(Number(c.dataset.pmpConn)); } catch (err) { status(esc(why(err)), "error"); } return; }
    if (e.target.closest("[data-pmp-off]")) { disconnect(); return; }
    const f = e.target.closest("[data-pmp-finish]");
    if (f) finishSplit(f.dataset.pmpFinish);
  });

  // ---------------- errors ----------------
  const PUMP_ERR = {
    6077: "Pump.fun isn't taking custom creator fees right now.", 6082: "Pump.fun no longer creates cashback coins.",
    NameTooLong: "The name is too long for Pump.fun (32 letters at most).", SymbolTooLong: "The symbol is too long for Pump.fun (13 letters at most).", UriTooLong: "The metadata link is too long.",
    TooMuchSolRequired: "The price moved — try the dev buy again.", NotAuthorized: "This wallet isn't allowed to do that.", CreateV2Disabled: "Pump.fun has paused new coins for a moment — try again later.",
  };
  function why(err) {
    if (!err) return "";
    if (err.code === 4001 || /reject|denied|cancel/i.test(String(err.message || ""))) return tr("Cancelled in your wallet.");
    const logs = (err.logs || (err.transactionLogs) || []).join("\n");
    const m = String(err.message || err);
    const am = /Error Code: (\w+)\. Error Number: (\d+)\. Error Message: ([^\n.]+)/.exec(logs + "\n" + m);
    if (am) return tr(PUMP_ERR[am[1]] || PUMP_ERR[am[2]] || am[3]);
    const cu = /"Custom":(\d+)|custom program error: 0x([0-9a-f]+)/i.exec(logs + "\n" + m);
    if (cu) { const n = cu[1] ? Number(cu[1]) : parseInt(cu[2], 16); if (PUMP_ERR[n]) return tr(PUMP_ERR[n]); if (n === 1) return tr("Not enough SOL in this wallet for the launch, the rent and the network fee."); return tr("Pump.fun refused it (error {n}).").replace("{n}", String(n)); }
    if (/insufficient lamports|insufficient funds|0x1\b|Attempt to debit an account but found no record/i.test(logs + m)) return tr("Not enough SOL in this wallet for the launch, the rent and the network fee.");
    if (/block ?height exceeded|blockhash not found|expired/i.test(m)) return tr("The transaction expired before it landed — try again.");
    return m.slice(0, 220);
  }

  // ---------------- what Pump.fun says ----------------
  let ctx = null, ctxAt = 0;
  async function pump(force) {
    if (ctx && !force && Date.now() - ctxAt < 3 * 60e3) return ctx;
    const K = await kit(), c = await conn();
    const sdk = new K.OnlinePumpSdk(c);
    const [global, feeConfig] = await Promise.all([sdk.fetchGlobal(), sdk.fetchFeeConfig().catch(() => null)]);
    ctx = { global, feeConfig };
    ctxAt = Date.now();
    return ctx;
  }
  // the SOL the curve holds once its last token is sold: x·y = k from the starting virtual reserves
  function gradSol(g) {
    const vs = Number(g.initialVirtualQuoteReserves && Number(g.initialVirtualQuoteReserves) > 0 ? g.initialVirtualQuoteReserves : g.initialVirtualSolReserves) / 1e9;
    const vt = Number(g.initialVirtualTokenReserves), rt = Number(g.initialRealTokenReserves);
    return vt > rt && vs > 0 ? `≈ ${Math.round((vs * vt) / (vt - rt) - vs)} SOL` : "—";
  }
  async function paintGate() {
    const box = $("pmp-gate");
    if (!box) return;
    if (!ready()) { box.className = "pon-gate pmp-gate wait"; box.innerHTML = `<b>${T("Being set up")}</b><span>${T("ARCIRCLE PAD's Solana treasury is being set up. The Pump.fun option opens here as soon as it's live.")}</span>`; return; }
    box.className = "pon-gate pmp-gate";
    box.innerHTML = `<span class="pon-gate-l">${T("Reading Pump.fun…")}</span>`;
    try {
      const c = await pump();
      const g = c.global, open = g.createV2Enabled !== false;
      const cells = [
        ["Launch fee", tr("Free")],
        ["Rent + network", `≈ ${RENT_EST} SOL`],
        ["Graduates at", gradSol(g)],
      ];
      box.className = "pon-gate pmp-gate" + (open ? "" : " no");
      box.innerHTML = `<div class="pon-gate-cells">${cells.map(([k, v]) => `<div><small>${T(k)}</small><b data-no-i18n>${esc(v)}</b></div>`).join("")}</div>` +
        (open ? "" : `<p class="pon-gate-no">${T("Pump.fun has paused new coins for a moment — try again later.")}</p>`);
    } catch { box.className = "pon-gate pmp-gate no"; box.innerHTML = `<p class="pon-gate-no">${T("Couldn't read Pump.fun on Solana right now — try again in a moment.")}</p>`; }
  }
  async function balance() {
    const el = $("pmp-balance");
    if (!el) return;
    if (!W.key || !ready()) { el.textContent = ""; return; }
    try {
      const K = await kit(), c = await conn();
      const lam = await c.getBalance(new K.PublicKey(W.key));
      const need = RENT_EST + (Number(($("pmp-devbuy") || {}).value) || 0);
      const ok = lam / 1e9 > need;
      el.className = "ap-launch-balance pmp-only " + (ok ? "ok" : "short");
      el.textContent = tr(ok ? "Solana wallet: {b} SOL · the launch needs about {n} SOL" : "Not enough SOL — the launch needs about {n} SOL; this wallet has {b} SOL.")
        .replace("{b}", solS(lam)).replace("{n}", need.toLocaleString("en-US", { maximumFractionDigits: 4 }));
    } catch { el.textContent = ""; }
  }

  // ---------------- the form ----------------
  function readForm() {
    const v = (id) => String(($(id) || {}).value || "").trim();
    const f = {
      name: v("ap-name"), symbol: v("ap-symbol").toUpperCase(), logo: v("ap-logo"), description: v("ap-description"),
      website: v("ap-website"), twitter: v("ap-twitter"), telegram: v("ap-telegram"), dev: Number(v("pmp-devbuy") || "0"),
    };
    const bad = (m) => ({ ok: false, msg: tr(m) });
    const bytes = (s) => new TextEncoder().encode(s).length;
    if (!ready()) return bad("ARCIRCLE PAD's Solana treasury is being set up — the Pump.fun option opens as soon as it's live.");
    if (!f.name || !f.symbol) return bad("Name and symbol are required.");
    if (bytes(f.name) > 32) return bad("The name is too long for Pump.fun (32 letters at most).");
    if (bytes(f.symbol) > 13) return bad("The symbol is too long for Pump.fun (13 letters at most).");
    if (f.logo && !/^https:\/\//i.test(f.logo)) return bad("Pump.fun needs a hosted logo link — upload the file (it's hosted for you) or paste an https:// image URL.");
    for (const k of ["website", "twitter", "telegram"]) if (f[k] && !/^https:\/\//i.test(f[k])) return bad("Links must start with https://");
    if (!(f.dev >= 0) || !isFinite(f.dev) || f.dev > 85) return bad("The dev buy must be between 0 and 85 SOL.");
    if (!$("pmp-agree").checked) return bad("Tick the box to confirm you've read how it works.");
    return { ok: true, f };
  }

  // ---------------- steps ----------------
  const STEPS = [["read", "Read Pump.fun and host the metadata"], ["sign", "Sign in your Solana wallet"], ["launch", "Launch on Pump.fun"], ["split", "Lock the 70 / 30 fee split"], ["list", "List it on ArcPad"]];
  function steps(show, only) {
    const ol = $("pmp-steps");
    ol.hidden = !show;
    if (show) ol.innerHTML = STEPS.filter(([k]) => !only || only.includes(k)).map(([k, l]) => `<li data-step="${k}"><i aria-hidden="true"></i><span><b>${T(l)}</b><small></small></span></li>`).join("");
  }
  function step(k, st, note) {
    const li = $("pmp-steps").querySelector(`[data-step="${k}"]`);
    if (!li) return;
    li.className = st;
    if (note != null) li.querySelector("small").innerHTML = note;
  }
  const status = (html, kind) => { $("ap-launch-status").innerHTML = html ? `<div class="status ${kind || "pending"}">${html}</div>` : ""; };
  const txLink = (sig) => `<a href="${esc(SCAN("tx", sig))}" target="_blank" rel="noopener">Solscan ↗</a>`;

  // ---------------- sending ----------------
  async function sign(txs) {
    if (!W.p) throw new Error(tr("Connect a Solana wallet first."));
    if (typeof W.p.signAllTransactions === "function") return W.p.signAllTransactions(txs);
    const out = [];
    for (const t of txs) out.push(await W.p.signTransaction(t));
    return out;
  }
  const raw = (t) => (typeof t.serialize === "function" ? t.serialize() : t);
  /// send, re-send every few seconds while it can still land, and wait for it to confirm → signature
  async function sendAndConfirm(signed, lastValid) {
    const c = await conn();
    const bytes = raw(signed);
    const sig = await c.sendRawTransaction(bytes, { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 2 });
    for (let i = 0; i < 90; i++) {
      await sleep(i < 4 ? 1200 : 2000);
      const st = await c.getSignatureStatuses([sig]).then((r) => r && r.value && r.value[0]).catch(() => null);
      if (st && st.err) throw Object.assign(new Error(tr("The transaction failed on Solana.")), { sig, logs: [JSON.stringify(st.err)] });
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
      if (i % 3 === 2) {
        const h = await c.getBlockHeight("confirmed").catch(() => null);
        if (h != null && lastValid && h > lastValid) throw Object.assign(new Error(tr("The transaction expired before it landed — try again.")), { sig, expired: true });
        c.sendRawTransaction(bytes, { skipPreflight: true, maxRetries: 0 }).catch(() => {});
      }
    }
    throw Object.assign(new Error(tr("Not confirmed yet — check it on Solscan.")), { sig });
  }
  async function blockhash() {
    const c = await conn();
    return c.getLatestBlockhash("confirmed");
  }

  // a launch whose split hasn't landed yet: kept here so it can be finished
  const pendKey = (a) => `arcircle.pump.pending.${a}`;
  const getPending = (a) => { try { return JSON.parse(localStorage.getItem(pendKey(a)) || "null"); } catch { return null; } };
  const setPending = (a, v) => { try { if (v) localStorage.setItem(pendKey(a), JSON.stringify(v)); else localStorage.removeItem(pendKey(a)); } catch { /* this visit */ } };

  async function register(mint, sig) {
    let last = "";
    for (let i = 0; i < 5; i++) {
      if (i) await sleep(2500 + i * 1000);
      const res = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pumpreg", mint, sig }) }).catch(() => null);
      const j = res ? await res.json().catch(() => ({})) : {};
      if (res && res.ok && j.ok) return { ok: true };
      last = j.error || (res ? `HTTP ${res.status}` : "offline");
      if (res && res.status === 409 && /isn't 70%|set up/.test(last)) break;
    }
    return { ok: false, error: last };
  }

  // ---------------- the launch ----------------
  let busy = false;
  async function hostMeta(f) {
    const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "pumpmeta", name: f.name, symbol: f.symbol, description: f.description, image: f.logo, twitter: f.twitter, telegram: f.telegram, website: f.website }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.uri) throw new Error(j.error || tr("Couldn't host the coin's metadata — try again."));
    return j.uri;
  }
  async function submit() {
    if (busy) return;
    const r = readForm();
    if (!r.ok) { status(esc(r.msg), "error"); return; }
    const f = r.f;
    if (!W.key) {
      status(T("Connect a Solana wallet first…"));
      try { if (!(await connect(0))) { status(T("No Solana wallet found — open this page in Phantom, Solflare or MetaMask."), "error"); paintWallet(); return; } }
      catch (e) { status(esc(why(e)), "error"); return; }
    }
    busy = true;
    const btn = $("ap-launch-submit"), lbl = btn.querySelector(".ap-launch-btn-label");
    btn.disabled = true; btn.classList.add("is-busy"); if (lbl) lbl.textContent = tr("Launching…");
    steps(true); status("");
    let cur = "read", mintKey = "", creator = W.key;
    try {
      step("read", "doing");
      const K = await kit();
      const [c, uri, bh] = await Promise.all([pump(true), hostMeta(f), blockhash()]);
      if (c.global.createV2Enabled === false) throw new Error(tr("Pump.fun has paused new coins for a moment — try again later."));
      const me = new K.PublicKey(creator), T0 = new K.PublicKey(TREASURY);
      if (me.equals(T0)) throw new Error(tr("This is ARCIRCLE PAD's treasury wallet — launch from another wallet."));
      const mint = K.Keypair.generate();
      mintKey = mint.publicKey.toBase58();
      const lam = Math.round(f.dev * 1e9);
      const bal = await (await conn()).getBalance(me);
      if (bal / 1e9 < RENT_EST + f.dev) throw new Error(tr("Not enough SOL in this wallet for the launch, the rent and the network fee."));
      const b = await K.launchTxs({ global: c.global, feeConfig: c.feeConfig, creator: me, mint: mint.publicKey, name: f.name, symbol: f.symbol, uri, devBuyLamports: lam, treasury: T0, creatorBps: 10000 - PLATFORM_BPS, blockhash: bh.blockhash });
      b.txs[0].partialSign(mint); // the new mint signs first, so the wallet doesn't rewrite a signed transaction
      step("read", "ok", `$${esc(f.symbol)} · ${esc(short(mintKey))}${lam ? ` · ${T("dev buy")} ${esc(solS(lam))} SOL` : ""}`);

      cur = "sign"; step("sign", "doing", T(b.txs.length > 1 ? "Two transactions, one prompt — confirm in your wallet…" : "Confirm in your wallet…"));
      const signed = await sign(b.txs);
      // a wallet that adjusted the create transaction (a priority fee, say) voids the mint's signature: sign it again
      try { const t0 = K.Transaction.from(raw(signed[0])); if (!t0.verifySignatures(true)) { t0.partialSign(mint); signed[0] = t0; } } catch { /* sent as it came */ }
      step("sign", "ok", T("Signed"));
      setPending(creator, { mint: mintKey, symbol: f.symbol, name: f.name, at: Date.now() });

      cur = "launch"; step("launch", "doing", T("Launching…"));
      const sig1 = await sendAndConfirm(signed[0], bh.lastValidBlockHeight);
      step("launch", "ok", `${esc(short(mintKey))} · ${txLink(sig1)}`);

      cur = "split";
      let sig2 = sig1;
      if (signed.length > 1) {
        step("split", "doing", T("Locking the split…"));
        try { sig2 = await sendAndConfirm(signed[1], bh.lastValidBlockHeight); }
        catch (e) {
          if (!e.expired) throw e;
          // the first one took the whole blockhash window: a fresh split, one more prompt
          step("split", "doing", T("One more signature — confirm in your wallet…"));
          sig2 = await splitAgain(mintKey);
        }
      }
      step("split", "ok", `${T("70% you, 30% ARCIRCLE PAD — locked")} · ${txLink(sig2)}`);

      cur = "list"; step("list", "doing");
      const reg = await register(mintKey, sig1);
      if (reg.ok) { step("list", "ok", T("In Explore under Pump.fun")); setPending(creator, null); }
      else step("list", "bad", esc(tr("The server couldn't list it yet ({e}) — the card above lists it later.").replace("{e}", reg.error || "offline")));
      done(mintKey, f.symbol, sig1);
      PM.at = 0; loadList();
    } catch (e) {
      console.warn("pump launch", e);
      step(cur, "bad", esc(why(e)) + (e && e.sig ? " · " + txLink(e.sig) : ""));
      status(esc(why(e)), "error");
    } finally {
      busy = false; btn.disabled = false; btn.classList.remove("is-busy");
      if (lbl) lbl.textContent = tr(active() ? "Launch on Pump.fun" : "Launch coin");
      balance();
      if (mintKey && W.key && getPending(W.key)) resume(); // a launch that landed without its split (or listing): the card finishes it
    }
  }
  async function splitAgain(mintKey) {
    const K = await kit();
    const bh = await blockhash();
    const t = await K.splitTx({ creator: new K.PublicKey(W.key), mint: new K.PublicKey(mintKey), treasury: new K.PublicKey(TREASURY), creatorBps: 10000 - PLATFORM_BPS, blockhash: bh.blockhash });
    const [s] = await sign([t]);
    return sendAndConfirm(s, bh.lastValidBlockHeight);
  }
  function done(mint, sym, sig) {
    status(`<b>${T("Your coin is live on Pump.fun.")}</b> <span data-no-i18n>$${esc(sym || "")}</span> · ${T("It trades on its Pump.fun bonding curve until it graduates to PumpSwap. Creator fees are paid out 70% to you, 30% to ARCIRCLE PAD — from the coin's card in Explore.")}
      <span class="agl-links"><a href="${esc(APP(mint))}" target="_blank" rel="noopener">Pump.fun ↗</a><a href="#explore?plat=pump&coin=${esc(mint)}">${T("See it in Explore")}</a><a href="${esc(SCAN("tx", sig))}" target="_blank" rel="noopener">Solscan ↗</a></span>`, "success");
    if (typeof window.arcConfetti === "function") window.arcConfetti();
  }

  // ---------------- the resume card: a launch whose split (or listing) didn't finish ----------------
  async function resume() {
    const box = $("pmp-resume");
    if (!box) return;
    const p = W.key && getPending(W.key);
    if (!active() || !p || busy || !isMint(p.mint)) { box.hidden = true; return; }
    const r = await fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "pumpreg", mint: p.mint }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r && r.ok && j.ok) { setPending(W.key, null); box.hidden = true; PM.at = 0; loadList(); return; }
    if (r && r.status === 404 && Date.now() - (p.at || 0) > 15 * 60e3) { setPending(W.key, null); box.hidden = true; return; } // never landed
    const needsSplit = r && r.status === 409 && /fee-sharing config|isn't locked|don't go/.test(j.error || "");
    box.hidden = false;
    box.innerHTML = `<div><b data-no-i18n>$${esc(p.symbol || "")}</b> <span>${T(needsSplit ? "launched, but its 70 / 30 fee split isn't locked yet." : "launched — not listed on ArcPad yet.")}</span></div>` +
      (needsSplit ? `<button type="button" class="ams-mini" data-pmp-finish="${esc(p.mint)}">${T("Lock the split")}</button>` : `<button type="button" class="ams-mini" data-pmp-finish="${esc(p.mint)}">${T("Try listing again")}</button>`) +
      `<a class="ams-mini" href="${esc(APP(p.mint))}" target="_blank" rel="noopener">Pump.fun ↗</a>`;
  }
  async function finishSplit(mint) {
    if (busy || !W.key) return;
    busy = true;
    steps(true, ["split", "list"]);
    let cur = "split";
    try {
      const K = await kit(), c = await conn();
      const sc = await c.getAccountInfo(K.feeSharingConfigPda(new K.PublicKey(mint)));
      const decoded = sc ? K.PUMP_SDK.decodeSharingConfig(sc) : null;
      if (!decoded || !decoded.adminRevoked) {
        step("split", "doing", T("Confirm in your wallet…"));
        const bh = await blockhash();
        // a config that exists but isn't locked yet: only the update, from its current shareholders
        const t = await K.splitTx({ creator: new K.PublicKey(W.key), mint: new K.PublicKey(mint), treasury: new K.PublicKey(TREASURY), creatorBps: 10000 - PLATFORM_BPS, blockhash: bh.blockhash, sharingConfig: decoded });
        const [s] = await sign([t]);
        const sig = await sendAndConfirm(s, bh.lastValidBlockHeight);
        step("split", "ok", txLink(sig));
      } else step("split", "ok", T("Already locked"));
      cur = "list"; step("list", "doing");
      const reg = await register(mint, "");
      if (!reg.ok) throw new Error(reg.error || "not listed");
      step("list", "ok", T("In Explore under Pump.fun"));
      setPending(W.key, null); $("pmp-resume").hidden = true; PM.at = 0; loadList();
    } catch (e) { step(cur, "bad", esc(why(e))); }
    finally { busy = false; }
  }

  // ---------------- the platform switch (arc-argus.js calls this) ----------------
  function active() { return panel.dataset.plat === "pump" && !fields.hidden; }
  function onPlat(p, quiet) {
    fields.hidden = p !== "pump";
    if (p !== "pump") return;
    paintWallet(); paintGate(); quietConnect(); balance(); resume();
    if (!quiet && !reduce) { fields.classList.remove("in"); void fields.offsetWidth; fields.classList.add("in"); }
  }

  // =====================================================================
  // Explore: coins launched on Pump.fun through ArcPad
  // =====================================================================
  const PM = { items: [], at: 0, busy: false };
  function rowOf(x) {
    return {
      platform: "pump", chain: "solana", token: x.mint, name: x.name || "", symbol: x.symbol || "", creator: x.creator, sharingConfig: x.sharingConfig, curve: x.curve,
      quoteToken: "solana", imageUrl: x.image || "", description: x.description || "", launchedAt: x.launchedAt || 0,
      twitter: x.twitter || "", telegram: x.telegram || "", discord: "", website: x.website || "",
      quoteSymbol: "SOL", quoteDecimals: 9, quoteIsUsdc: false, priceUsdc: x.priceUsd, priceInQuote: x.priceSol, marketCapUsd: x.mcapUsd, isLivePrice: x.priceUsd != null,
      progress: x.progress, graduated: !!x.graduated, feesWaiting: x.feesWaitingLamports, sig: x.sig, active: x.active,
    };
  }
  async function loadList() {
    if (PM.busy || Date.now() - PM.at < 45e3) return PM.items;
    PM.busy = true;
    try {
      const r = await fetch("/api/social?pumparc=list", { cache: "no-store" });
      const j = r.ok ? await r.json() : null;
      if (j && Array.isArray(j.items)) { PM.items = j.items.filter((x) => x.active !== false && isMint(x.mint)).map(rowOf); PM.at = Date.now(); }
    } catch { /* keep what we had */ }
    PM.busy = false;
    if (typeof renderArcpadExploreGrid === "function" && document.getElementById("ap-explore-grid") && typeof ARC !== "undefined" && ARC.launchesLoaded) renderArcpadExploreGrid();
    deepLink();
    return PM.items;
  }
  function deepLink() {
    const dl = /^#explore\b.*[?&]coin=([1-9A-HJ-NP-Za-km-z]{32,44})\b/.exec(location.hash);
    if (dl && PM.opened !== dl[1] && PM.items.some((x) => x.token === dl[1])) { PM.opened = dl[1]; openSheet(dl[1]); }
  }
  function gradHtml(l, kind) {
    const p = l.graduated ? 100 : Math.max(0, Math.min(100, Number(l.progress) || 0));
    const lab = l.graduated ? tr("Graduated · PumpSwap") : `${p.toFixed(p < 10 ? 1 : 0)}% ${tr("to graduation")}`;
    return `<div class="pon-grad pmp-grad ${kind || ""}${l.graduated ? " done" : ""}" style="--p:${p.toFixed(1)}%" role="img" aria-label="${esc(lab)}"><div class="trk"><i></i></div><small><span>${esc(lab)}</span></small></div>`;
  }
  function cardHtml(l, img) {
    const age = typeof actAgo === "function" && l.launchedAt ? actAgo(l.launchedAt) : "";
    return `
    <button type="button" class="launch-card card-type-curve ap-launch-card is-pump" data-token="${esc(l.token)}" data-platform="pump" style="text-align:left;cursor:pointer;border:1px solid var(--line);font:inherit;">
      <div class="ap-card-top">${img}<span class="ap-plat-tag pump">Pump.fun</span><span class="ap-card-age">${esc(age)}</span></div>
      <div class="sym">$${esc(l.symbol)} <span class="ap-pair-tag">/ SOL</span></div>
      <div class="name">${esc(l.name)}</div>
      ${gradHtml(l, "card")}
      <div class="meta"><span>${l.marketCapUsd != null ? usd(l.marketCapUsd) : "—"} mcap</span><span class="pmp-chain">Solana</span></div>
    </button>`;
  }

  let sheet = null;
  function openSheet(token) {
    const l = PM.items.find((x) => x.token === token);
    if (!l) return false;
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.className = "agl-sheet pon-sheet pmp-sheet"; sheet.hidden = true;
      sheet.innerHTML = `<div class="agl-sh-bg" data-sh-close></div><div class="agl-sh-box" role="dialog" aria-modal="true" aria-labelledby="pmp-sh-t"></div>`;
      document.body.appendChild(sheet);
      sheet.addEventListener("click", (e) => { if (e.target.closest("[data-sh-close]")) closeSheet(); const c = e.target.closest("[data-pmp-pay]"); if (c) payOut(c.dataset.pmpPay); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet && !sheet.hidden) closeSheet(); });
    }
    const m = l.marketCapUsd, lo = SUP.DEX_INFO_MCAP, hi = SUP.MARKETING_MCAP;
    const logo = /^https:\/\//i.test(l.imageUrl) ? `<img src="${esc(l.imageUrl)}" alt="" onerror="this.remove()">` : `<span>${esc(String(l.symbol || "?").slice(0, 1))}</span>`;
    const ms = (need, label, sub) => { const on = m != null && m >= need; return `<li class="${on ? "on" : ""}"><i aria-hidden="true">${on ? "✓" : ""}</i><span><b>${T(label)}</b><small>${T(sub)}</small></span></li>`; };
    const w = l.feesWaiting != null ? BigInt(l.feesWaiting) : null;
    const you = w != null ? w - (w * BigInt(PLATFORM_BPS)) / 10000n : null;
    sheet.querySelector(".agl-sh-box").innerHTML = `
      <button type="button" class="agl-sh-x" data-sh-close aria-label="${T("Close")}">×</button>
      <div class="agl-sh-h"><div class="agl-sh-logo">${logo}</div><div><h3 id="pmp-sh-t" data-no-i18n>$${esc(l.symbol)} <small>${esc(l.name)}</small></h3><span class="agl-sh-tag">${T("Launched on Pump.fun via ArcPad · Solana")}</span></div></div>
      <div class="agl-sh-stats"><div><small>${T("Price")}</small><b data-no-i18n>${l.priceUsdc != null ? usd(l.priceUsdc) : "—"}</b></div><div><small>${T("Market cap")}</small><b data-no-i18n>${usd(m)}</b></div><div><small>${T("Creator")}</small><b data-no-i18n><a href="${esc(SCAN("account", l.creator))}" target="_blank" rel="noopener">${esc(short(l.creator))}</a></b></div></div>
      ${gradHtml(l, "lg")}
      <div class="pon-fees pmp-fees"><div><b>${T("Creator fees")}</b><small>${T("Shared by Pump.fun's fee program: 70% the creator, 30% ARCIRCLE PAD — locked at launch, for good. Anyone can pay them out.")}</small></div>
        <span class="pon-fees-v" data-no-i18n>${w != null ? `${solS(w.toString(), 6)} SOL <small>${T("waiting")} · ${esc(solS(you.toString(), 6))} SOL ${T("is the creator's")}${l.graduated ? " · " + T("plus any PumpSwap fees") : ""}</small>` : "—"}</span>
        <button type="button" class="ams-mini" data-pmp-pay="${esc(l.token)}"${w === 0n && !l.graduated ? " disabled" : ""}>${T("Pay out fees")}</button></div>
      <p class="pon-fees-msg" id="pmp-fees-msg" aria-live="polite"></p>
      ${window.arcArgus && window.arcArgus.progress ? window.arcArgus.progress(m, "lg") : ""}
      <ul class="agl-sh-ms">${ms(lo, "Dexscreener info support", "From a $20K market cap: we help update the coin's Dexscreener info.")}${ms(hi, "Marketing support", "From a $100K market cap: boosts, calls and promotion, case by case.")}</ul>
      <p class="agl-sh-note">${T("Support may be refused if our Token Scanner finds signs of manipulation. It is ARCIRCLE PAD's own policy, not a contract. Trade with care.")}</p>
      ${l.description ? `<p class="agl-sh-desc" data-no-i18n>${esc(l.description)}</p>` : ""}
      <div class="agl-sh-acts"><a class="bp-btn-primary" href="${esc(APP(l.token))}" target="_blank" rel="noopener">${T("Trade on Pump.fun")} ↗</a><a class="bp-btn-ghost" href="${esc(SCAN("token", l.token))}" target="_blank" rel="noopener">Solscan ↗</a>${l.website && /^https:\/\//i.test(l.website) ? `<a class="bp-btn-ghost" href="${esc(l.website)}" target="_blank" rel="noopener nofollow">${T("Website")} ↗</a>` : ""}${l.twitter && /^https:\/\//i.test(l.twitter) ? `<a class="bp-btn-ghost" href="${esc(l.twitter)}" target="_blank" rel="noopener nofollow">X ↗</a>` : ""}</div>`;
    sheet.hidden = false;
    document.documentElement.classList.add("agl-sh-open");
    requestAnimationFrame(() => sheet.classList.add("in"));
    return true;
  }
  function closeSheet() {
    if (!sheet) return;
    sheet.classList.remove("in");
    document.documentElement.classList.remove("agl-sh-open");
    setTimeout(() => { sheet.hidden = true; }, reduce ? 0 : 200);
  }
  // permissionless: whoever pays the network fee sends the waiting fees to both shareholders
  async function payOut(token) {
    const l = PM.items.find((x) => x.token === token);
    const msg = (h, k) => { const el = $("pmp-fees-msg"); if (el) { el.className = "pon-fees-msg " + (k || ""); el.innerHTML = h; } };
    if (!l || busy) return;
    const b = sheet.querySelector("[data-pmp-pay]");
    busy = true; if (b) b.disabled = true;
    try {
      if (!W.key) { msg(T("Connect a Solana wallet…")); if (!(await connect(0))) throw new Error(tr("No Solana wallet found — open this page in Phantom, Solflare or MetaMask.")); }
      const K = await kit(), c = await conn();
      const mint = new K.PublicKey(l.token);
      const sc = await c.getAccountInfo(K.feeSharingConfigPda(mint));
      if (!sc) throw new Error(tr("This coin's fee-sharing config couldn't be read."));
      const decoded = K.PUMP_SDK.decodeSharingConfig(sc);
      const bh = await blockhash();
      const t = await K.distributeTx({ payer: new K.PublicKey(W.key), mint, sharingConfig: decoded, graduated: !!l.graduated, blockhash: bh.blockhash });
      msg(T("Confirm in your wallet…"));
      const [s] = await sign([t]);
      msg(T("Paying out…"));
      const sig = await sendAndConfirm(s, bh.lastValidBlockHeight);
      msg(`${T("Paid out: 70% to the creator, 30% to ARCIRCLE PAD.")} ${txLink(sig)}`, "ok");
      PM.at = 0; loadList();
    } catch (e) { msg(esc(why(e)), "bad"); if (b) b.disabled = false; }
    finally { busy = false; }
  }

  // ---------------- wiring ----------------
  const dev = $("pmp-devbuy");
  if (dev) dev.addEventListener("input", () => { clearTimeout(dev.t); dev.t = setTimeout(balance, 400); });
  document.addEventListener("arc:lang", () => { if (active()) { paintWallet(); paintGate(); } });
  window.arcPump = { active, submit, rows: () => PM.items, load: loadList, openSheet, onPlat, card: cardHtml, ready, _kit: kit };
  if (panel.dataset.plat === "pump") onPlat("pump", true);
  window.addEventListener("hashchange", () => { if (/[?&]coin=[1-9A-HJ-NP-Za-km-z]{32,44}/.test(location.hash)) { if (PM.items.length) deepLink(); else loadList(); } });
  document.addEventListener("arcpad:tab", (e) => { const t = e.detail && e.detail.tab; if (t === "explore" || t === "home") loadList(); if (t === "launch" && active()) resume(); });
  setTimeout(loadList, 1600);
})();
