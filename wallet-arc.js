// wallet-arc.js — ARCIRCLE Wallet, the light part (a few KB, on every page that offers it). Sign in with email, Google
// or Apple and an embedded wallet is made for you on Arc and Robinhood Chain (Privy; the key never reaches
// arcircle.app, and you can export it to any wallet). The heavy part (wallet-core/, built by tools/build-wallet.mjs)
// downloads only when someone opens the wallet or signs in, or when a wallet already signed in comes back.
//
//   window.arcWallet: { enabled, state(), load(), login(), logout(), exportWallet(), provider, on(fn) }
//   · provider is an EIP-1193 provider (request / on / removeListener) that the site's existing flows use like any
//     browser wallet, and it is announced over EIP-6963 as "ARCIRCLE Wallet", so the connect dialog lists it
//   · until PRIVY_APP_ID below is set, enabled is false and nothing is announced (the wallet page says it opens soon)
(function () {
  "use strict";
  if (window.arcWallet) return;
  // The Privy app's ID (dashboard.privy.io → the app → Settings). Public by design: it only names the app; Privy checks
  // the site's domain against the app's allowed domains.
  var PRIVY_APP_ID = "";
  var CORE = "/wallet-core/privy-entry.js";
  var HINT = "arcwallet.on";
  var ICON = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#0b0e2c"/><circle cx="25" cy="32" r="12" fill="none" stroke="#2f6bff" stroke-width="5"/><circle cx="39" cy="32" r="12" fill="none" stroke="#1fe0a6" stroke-width="5"/></svg>');
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  var P = function () { return window.__arcPrivy || {}; };
  var listeners = {}, subs = [], loading = null, inner = null, innerFor = "";
  var fire = function (ev, v) { (listeners[ev] || []).slice().forEach(function (fn) { try { fn(v); } catch (e) { /* a listener's own problem */ } }); };
  var state = function () { var p = P(); return { enabled: !!PRIVY_APP_ID, loaded: !!p.mounted, ready: !!p.ready, authenticated: !!p.authenticated, address: p.address || "", email: p.email || "", method: p.method || "" }; };

  function load() {
    if (!PRIVY_APP_ID) return Promise.reject(new Error("ARCIRCLE Wallet isn't open yet"));
    if (loading) return loading;
    loading = import(CORE).then(function () {
      window.__arcPrivyMount(PRIVY_APP_ID);
      return new Promise(function (ok, no) {
        var t0 = Date.now();
        (function wait() { if (P().ready) return ok(); if (Date.now() - t0 > 20000) return no(new Error("ARCIRCLE Wallet didn't start. Check your connection and try again.")); setTimeout(wait, 80); })();
      });
    });
    loading.catch(function () { loading = null; });
    return loading;
  }
  function login() {
    return load().then(function () { return P().login(); }).then(function () {
      return new Promise(function (ok, no) {
        var t0 = Date.now();
        (function wait() { if (P().address) return ok(P().address); if (Date.now() - t0 > 30000) return no(new Error("Your wallet is still being created. Try again in a moment.")); setTimeout(wait, 120); })();
      });
    });
  }
  function logout() { ls.set(HINT, null); var p = P(); return p.logout ? Promise.resolve(p.logout()) : Promise.resolve(); }
  function getInner() {
    var p = P();
    if (!p.address) return Promise.resolve(null);
    if (inner && innerFor === p.address) return Promise.resolve(inner);
    return p.provider().then(function (pr) { inner = pr; innerFor = p.address; return pr; });
  }

  // ---- the EIP-1193 face the rest of the site sees ----
  var provider = {
    isArcircleWallet: true,
    request: function (args) {
      var m = args && args.method, params = (args && args.params) || [];
      if (m === "eth_requestAccounts") return login().then(function (a) { return [a]; });
      if (m === "eth_accounts") {
        if (state().address) return Promise.resolve([state().address]);
        if (!ls.get(HINT) || !PRIVY_APP_ID) return Promise.resolve([]);
        return load().then(function () { return P().address ? [P().address] : []; }).catch(function () { return []; });
      }
      if (m === "wallet_switchEthereumChain") {
        var id = parseInt(params[0] && params[0].chainId, 16);
        return getInner().then(function (pr) {
          if (!pr) throw Object.assign(new Error("Sign in to ARCIRCLE Wallet first."), { code: 4100 });
          return Promise.resolve(P().switchChain(id)).then(function () { fire("chainChanged", "0x" + id.toString(16)); return null; });
        });
      }
      if (m === "wallet_addEthereumChain") return Promise.resolve(null); // Arc and Robinhood Chain are built in
      return getInner().then(function (pr) {
        if (!pr) {
          if (m === "eth_chainId") return "0x13b2";
          throw Object.assign(new Error("Sign in to ARCIRCLE Wallet first."), { code: 4100 });
        }
        return pr.request({ method: m, params: params });
      });
    },
    on: function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return provider; },
    removeListener: function (ev, fn) { listeners[ev] = (listeners[ev] || []).filter(function (x) { return x !== fn; }); return provider; },
  };
  provider.off = provider.removeListener;

  var lastAddr = "";
  window.addEventListener("arcprivy:change", function () {
    var s = state();
    if (s.authenticated && s.address) ls.set(HINT, "1");
    if (s.address !== lastAddr) {
      lastAddr = s.address; inner = null;
      fire("accountsChanged", s.address ? [s.address] : []);
      if (!s.address) fire("disconnect", { code: 4900, message: "signed out" });
    }
    subs.forEach(function (fn) { try { fn(s); } catch (e) { /* fine */ } });
  });

  // ---- EIP-6963: the connect dialog finds it next to the browser's own wallets ----
  var info = { uuid: "93a64f97-e83d-4c24-8333-573683df2a81", name: "ARCIRCLE Wallet", icon: ICON, rdns: "app.arcircle.wallet" };
  function announce() { if (!PRIVY_APP_ID) return; try { window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info: info, provider: provider }) })); } catch (e) { /* old browsers */ } }
  window.addEventListener("eip6963:requestProvider", announce);
  announce();

  window.arcWallet = {
    enabled: !!PRIVY_APP_ID, provider: provider, state: state, load: load, login: login, logout: logout,
    exportWallet: function () { return load().then(function () { return P().exportWallet(); }); },
    on: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (x) { return x !== fn; }); }; },
  };
  // someone signed in before: start the core when the page is idle, so their wallet is back without a click
  if (PRIVY_APP_ID && ls.get(HINT)) (window.requestIdleCallback || function (f) { setTimeout(f, 1200); })(function () { load().catch(function () { /* they can sign in again */ }); });
})();
