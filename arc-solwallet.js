// arc-solwallet.js — the Solana wallet on ArcPad (window.arcSol): one connection shared by the wallet menu's Solana
// choice (arc-shared.js) and the Pump.fun launch (arc-pump.js).
//
// Solana isn't an EVM chain, so it isn't a network the Arc / Robinhood wallet switches to: it's a second wallet —
// Phantom, Solflare or Backpack — connected beside it. The EVM wallet stays as it is; ArcPad's Arc and Robinhood Chain
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

  /// injected providers: Phantom, Solflare, Backpack, then anything else that speaks the same API
  function providers() {
    const out = [], seen = new Set();
    const add = (name, p) => { if (p && !seen.has(p) && typeof p.connect === "function" && (typeof p.signAllTransactions === "function" || typeof p.signTransaction === "function")) { seen.add(p); out.push({ name, p }); } };
    add("Phantom", window.phantom && window.phantom.solana);
    add("Solflare", window.solflare);
    add("Backpack", window.backpack && (window.backpack.solana || window.backpack));
    add("Solana wallet", window.solana);
    return out;
  }
  const S = {
    p: null, name: "", key: "",
    providers,
    mobile: () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ""),
    /// a page link that opens this page inside a wallet's own browser (phones without an injected wallet)
    openIn: (w) => {
      const here = encodeURIComponent(location.href), ref = encodeURIComponent(location.origin);
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
    // already connected (any wallet), or Phantom / Backpack's no-prompt reconnect; others would open a popup, so not those
    if (pick.p.isConnected && isKey(pubOf(pick.p))) { attach(pick, pubOf(pick.p)); return true; }
    if (pick.name !== "Phantom" && pick.name !== "Backpack") return false;
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
  if (document.readyState === "complete") setTimeout(boot, 300); else window.addEventListener("load", () => setTimeout(boot, 300));
})();
