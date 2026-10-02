// arc-solwallet.js — the Solana wallet on ArcPad (window.arcSol): one connection shared by the wallet menu's Solana
// choice (arc-shared.js) and the Pump.fun launch (arc-pump.js).
//
// Solana isn't an EVM chain, so it isn't a network the Arc / Robinhood wallet switches to: it's a second wallet —
// Phantom, Solflare, Backpack, MetaMask (Wallet Standard) — connected beside it. The EVM wallet stays as it is; ArcPad's Arc and Robinhood Chain
// writes keep using it. Every change is announced as an "arc:solwallet" event.
//   arcSol.connect(i)   ask wallet i (from providers()) for its address
//   arcSol.quiet()      reconnect a wallet that already trusts this site, without a prompt
//   arcSol.disconnect()
//   arcSol.key / name / p   the address (base58), the wallet's name, its provider
//   arcSol.selected()   whether the wallet menu shows Solana (remembered per browser)
(function () {
  "use strict";
  if (window.arcSol) return;
  const KEY_W = "arcircle.sol.wallet", KEY_SEL = "arcircle.walletnet.sol";
  const isKey = (a) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(a || ""));
  const pubOf = (p) => { try { return p && p.publicKey ? p.publicKey.toString() : ""; } catch { return ""; } };
  const get = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const put = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* this visit */ } };
  // the old key the Pump.fun form used first
  if (!get(KEY_W) && get("arcircle.pump.wallet")) put(KEY_W, get("arcircle.pump.wallet"));

  // ---- Wallet Standard (how MetaMask, and most newer wallets, offer Solana: no window.solana, a registry instead)
  const CH = "solana:mainnet";
  const STD = [];
  const okStd = (w) => w && w.features && w.features["standard:connect"] && w.features["solana:signTransaction"] && (w.chains || []).some((c) => String(c).startsWith("solana:"));
  const stdApi = Object.freeze({ register: (...ws) => { for (const w of ws) if (okStd(w) && !STD.includes(w)) STD.push(w); return () => { for (const w of ws) { const i = STD.indexOf(w); if (i >= 0) STD.splice(i, 1); } }; } });
  try {
    window.addEventListener("wallet-standard:register-wallet", (e) => { try { e.detail(stdApi); } catch { /* a wallet's own error */ } });
    window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: stdApi }));
  } catch { /* no registry */ }
  /// a Wallet Standard wallet in the shape the rest of the page uses (connect / publicKey / signAllTransactions / on)
  const wrapped = new WeakMap();
  function stdProvider(w) {
    if (wrapped.has(w)) return wrapped.get(w);
    let acct = null;
    const pickAcct = (accs) => (accs || []).find((a) => (a.chains || []).includes(CH)) || (accs || []).find((a) => (a.chains || []).some((c) => String(c).startsWith("solana:"))) || null;
    const setAcct = (a) => { acct = a; p.publicKey = a ? { toString: () => a.address, toBase58: () => a.address } : null; };
    const p = {
      isStandard: true, publicKey: null,
      get isConnected() { return !!acct; },
      async connect(o) {
        const r = await w.features["standard:connect"].connect(o && o.onlyIfTrusted ? { silent: true } : undefined);
        setAcct(pickAcct((r && r.accounts) || w.accounts));
        if (!acct) throw new Error(o && o.onlyIfTrusted ? "not trusted" : "The wallet didn't share a Solana address — turn on a Solana account in it.");
        return { publicKey: p.publicKey };
      },
      async disconnect() { setAcct(null); const f = w.features["standard:disconnect"]; if (f) await f.disconnect(); },
      // every transaction in one prompt when the wallet takes several, one by one otherwise
      async signAllTransactions(txs) {
        if (!acct) throw new Error("Connect the wallet first.");
        const ins = txs.map((t) => ({ account: acct, chain: CH, transaction: t.serialize({ requireAllSignatures: false, verifySignatures: false }) }));
        const F = w.features["solana:signTransaction"];
        let outs;
        try { outs = await F.signTransaction(...ins); }
        catch (e) { if (ins.length < 2 || e.code === 4001 || /reject|denied|cancel/i.test(String(e.message || ""))) throw e; outs = []; for (const x of ins) outs.push(...(await F.signTransaction(x))); }
        return outs.map((o) => { const b = o.signedTransaction; return { serialize: () => b }; });
      },
      async signTransaction(t) { return (await p.signAllTransactions([t]))[0]; },
      on(ev, fn) {
        const E = w.features["standard:events"];
        if (!E) return;
        E.on("change", (c) => {
          if (!c || !c.accounts) return;
          const a = pickAcct(c.accounts);
          if (ev === "accountChanged" && a && (!acct || a.address !== acct.address)) { setAcct(a); fn(p.publicKey); }
          if (ev === "disconnect" && !a) { setAcct(null); fn(); }
        });
      },
    };
    wrapped.set(w, p);
    return p;
  }

  /// injected providers (Phantom, Solflare, Backpack, anything on window.solana), then Wallet Standard wallets not already
  /// listed — MetaMask among them
  function providers() {
    const out = [], seen = new Set();
    const add = (name, p) => { if (p && !seen.has(p) && typeof p.connect === "function" && (typeof p.signAllTransactions === "function" || typeof p.signTransaction === "function")) { seen.add(p); out.push({ name, p }); } };
    add("Phantom", window.phantom && window.phantom.solana);
    add("Solflare", window.solflare);
    add("Backpack", window.backpack && (window.backpack.solana || window.backpack));
    if (window.solana && !window.solana.isPhantom) add("Solana wallet", window.solana);
    const have = new Set(out.map((x) => x.name.toLowerCase()));
    for (const w of STD) {
      const n = String(w.name || "Solana wallet").slice(0, 24);
      if (have.has(n.toLowerCase())) continue;
      have.add(n.toLowerCase());
      out.push({ name: n, p: stdProvider(w), icon: w.icon || "" });
    }
    return out;
  }
  const S = {
    p: null, name: "", key: "",
    providers,
    mobile: () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ""),
    /// a page link that opens this page inside a wallet's own browser (phones without an injected wallet)
    openIn: (w) => {
      const here = encodeURIComponent(location.href), ref = encodeURIComponent(location.origin);
      if (w === "MetaMask") return `https://metamask.app.link/dapp/${location.host}${location.pathname}${location.search}${location.hash}`;
      return w === "Solflare" ? `https://solflare.com/ul/v1/browse/${here}?ref=${ref}` : `https://phantom.app/ul/browse/${here}?ref=${ref}`;
    },
    selected: () => get(KEY_SEL) === "1",
    select(on) { put(KEY_SEL, on ? "1" : ""); emit(); },
  };
  function emit() { document.dispatchEvent(new CustomEvent("arc:solwallet", { detail: { key: S.key, name: S.name, selected: S.selected() } })); }
  function attach(pick, key) {
    S.p = pick.p; S.name = pick.name; S.key = key;
    put(KEY_W, pick.name);
    if (typeof pick.p.on === "function" && !pick.p.__arcSol) {
      pick.p.__arcSol = 1;
      pick.p.on("accountChanged", (k) => { if (S.p !== pick.p) return; S.key = k ? k.toString() : pubOf(pick.p); emit(); });
      pick.p.on("disconnect", () => { if (S.p === pick.p) { S.p = null; S.key = ""; emit(); } });
    }
    emit();
  }
  S.connect = async function (i) {
    const pick = providers()[i || 0];
    if (!pick) return false;
    await pick.p.connect();
    const key = pubOf(pick.p);
    if (!isKey(key)) throw new Error("The wallet didn't share an address.");
    attach(pick, key);
    return true;
  };
  S.quiet = async function () {
    if (S.p) return true;
    const want = get(KEY_W);
    const list = providers(), pick = list.find((x) => x.name === want);
    if (!pick) return false;
    // already connected (any wallet), or a no-prompt reconnect (Phantom, Backpack, any Wallet Standard wallet's silent
    // connect); Solflare's own would open a popup, so not that one
    if (pick.p.isConnected && isKey(pubOf(pick.p))) { attach(pick, pubOf(pick.p)); return true; }
    if (pick.name !== "Phantom" && pick.name !== "Backpack" && !pick.p.isStandard) return false;
    try { await pick.p.connect({ onlyIfTrusted: true }); const k = pubOf(pick.p); if (isKey(k)) { attach(pick, k); return true; } } catch { /* asks on click */ }
    return false;
  };
  S.disconnect = async function () {
    try { if (S.p && typeof S.p.disconnect === "function") await S.p.disconnect(); } catch { /* fine */ }
    S.p = null; S.key = ""; put(KEY_W, ""); put(KEY_SEL, "");
    emit();
  };
  window.arcSol = S;
  // the menu showed Solana last visit: reconnect quietly once the page (and the wallet's injection) is up
  const boot = () => { if (S.selected() || get(KEY_W)) S.quiet(); };
  if (document.readyState === "complete") setTimeout(boot, 600); else window.addEventListener("load", () => setTimeout(boot, 600));
})();
