// arc-connect.js — one wallet button for every ARCIRCLE PAD page (styles: arc-nav.css, .cw-*).
//
// The same control sits at the right end of the menu bar everywhere: "Connect wallet" until a wallet is connected,
// then the address with a menu — copy, network, balances, what's ready to claim, portfolio, recent transactions,
// explorer, disconnect. Two ways of working under the one look:
//   · app pages (ArcPad, CirclePad, Reward…): the page's own wallet code does the connecting (AppKit / WalletConnect,
//     Robinhood Chain, Solana); this reads state.account and calls connectWallet() / disconnectWallet() /
//     switchToArcNetwork() / switchToAltNetwork() / switchToSolana(). The page's own wallet slot is hidden.
//   · every other page: the browser's wallets (EIP-6963, else window.ethereum), with a small chooser when there are
//     several, links to open the site inside a wallet app on phones, and ArcPad's connect (WalletConnect QR).
// A wallet connected on one page shows on the next (the address is remembered in this browser; signing reconnects
// when needed). "Disconnect" anywhere forgets it everywhere (shares ArcPad's homepad.walletDisconnected flag).
//   window.arcConnect: { address(), live(), connect(), disconnect(), provider(), mount(), on(fn) }
(function () {
  "use strict";
  if (window.arcConnect) return;
  var D = document, H = D.documentElement;
  var lang = function () { var l = (H.getAttribute("lang") || "en").slice(0, 2); if (l !== "ko" && l !== "zh") { try { l = localStorage.getItem("arcircle.lang") || l; } catch (e) { /* private */ } } return l === "ko" || l === "zh" ? l : "en"; };
  var L = function (en, ko, zh) { var l = lang(); return l === "ko" ? ko : l === "zh" ? zh : en; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var isAddr = function (a) { return /^0x[0-9a-fA-F]{40}$/.test(String(a || "")); };
  var lc = function (a) { return String(a || "").toLowerCase(); };
  var short = function (a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : ""; };
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private */ } },
  };
  var KEY = "arc.cw", OFF = "homepad.walletDisconnected", TXK = "arc.cw.tx";
  var C = function () { return window.CONFIG || {}; };
  var ARC = { id: 5042, hex: "0x13b2", name: "Arc", rpc: "https://rpc.mainnet.arc.io", expl: "https://arc.etherscan.io", token: "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7" };
  var RH = { id: 4663, hex: "0x1237", name: "Robinhood Chain", rpc: "https://rpc.mainnet.chain.robinhood.com", expl: "https://robinhoodchain.blockscout.com" };
  var subs = [];
  var api = (window.arcConnect = { on: function (fn) { subs.push(fn); } });

  // ---------------- which mode ----------------
  var appMode = function () { return typeof connectWallet === "function" && typeof state !== "undefined" && !!D.getElementById("wallet-slot"); };

  // ---------------- browser wallets (EIP-6963) ----------------
  var provs = new Map();
  window.addEventListener("eip6963:announceProvider", function (e) {
    var d = e.detail;
    if (d && d.info && d.provider) provs.set(d.info.rdns || d.info.uuid, d);
  });
  try { window.dispatchEvent(new Event("eip6963:requestProvider")); } catch (e) { /* old browser */ }
  function wallets() {
    var list = Array.from(provs.values());
    if (!list.length && window.ethereum) list.push({ info: { name: window.ethereum.isMetaMask ? "MetaMask" : window.ethereum.isRabby ? "Rabby" : L("Browser wallet", "브라우저 지갑", "浏览器钱包"), rdns: "injected", icon: "" }, provider: window.ethereum });
    return list;
  }

  // ---------------- the standalone session ----------------
  var S = { addr: "", live: false, prov: null, rdns: "", chain: 0 };
  function saved() { try { var j = JSON.parse(ls.get(KEY) || "null"); return j && isAddr(j.a) ? j : null; } catch (e) { return null; } }
  function remember(a, rdns) { if (isAddr(a)) ls.set(KEY, JSON.stringify({ a: lc(a), rdns: rdns || (saved() || {}).rdns || "", at: Date.now() })); ls.set(OFF, null); try { ls.set("arc.v10.acct", lc(a)); } catch (e) { /* fine */ } }
  function forget() { ls.set(KEY, null); ls.set(OFF, "1"); }
  function attach(p) {
    if (!p || p.__cw) return;
    p.__cw = true;
    try {
      p.on && p.on("accountsChanged", function (a) { if (appMode()) return; if (a && a[0]) { S.addr = lc(a[0]); S.live = true; remember(S.addr, S.rdns); } else { S.live = false; } paint(); emit(); });
      p.on && p.on("chainChanged", function (c) { if (appMode()) return; S.chain = parseInt(c, 16) || 0; paint(); });
    } catch (e) { /* provider without events */ }
  }
  function restore() {
    if (appMode()) return;
    var sv = saved();
    if (!sv || ls.get(OFF) === "1") return;
    S.addr = sv.a; S.rdns = sv.rdns; S.live = false;
    paint();
    // the wallets announce themselves within a moment: ask the one we used, quietly
    setTimeout(function () {
      var w = (sv.rdns && provs.get(sv.rdns)) || wallets()[0];
      if (!w) return;
      w.provider.request({ method: "eth_accounts" }).then(function (a) {
        a = (a || []).map(lc);
        if (a.indexOf(sv.a) >= 0) { S.prov = w.provider; S.live = true; attach(w.provider); return w.provider.request({ method: "eth_chainId" }).then(function (c) { S.chain = parseInt(c, 16) || 0; }); }
      }).catch(function () { /* stays remembered */ }).then(function () { paint(); emit(); });
    }, 350);
  }

  // ---------------- what everything else asks ----------------
  api.address = function () {
    if (appMode()) return typeof state !== "undefined" && state.account ? lc(state.account) : "";
    return S.addr;
  };
  api.live = function () { return appMode() ? !!(typeof state !== "undefined" && state.account) : S.live; };
  function chainId() {
    if (appMode()) { var c = typeof state !== "undefined" && state.chainId; return Number(c) || 0; }
    return S.chain;
  }
  /// an EIP-1193 provider for the connected wallet (connects first if needed)
  api.provider = function () {
    if (appMode()) return (typeof state !== "undefined" && state.walletProvider) || window.ethereum || null;
    if (S.live && S.prov) return Promise.resolve(S.prov);
    return api.connect().then(function () { return S.prov; });
  };
  function emit() { var a = api.address(); subs.forEach(function (fn) { try { fn(a); } catch (e) { /* listener's own */ } }); }

  // ---------------- connect / disconnect ----------------
  api.connect = function () {
    if (appMode()) {
      if (typeof setUserDisconnected === "function") setUserDisconnected(false);
      return Promise.resolve(connectWallet());
    }
    var list = wallets();
    if (list.length === 1) return use(list[0]);
    return chooser(list);
  };
  function use(w) {
    return w.provider.request({ method: "eth_requestAccounts" }).then(function (a) {
      if (!a || !a[0]) throw new Error("no account");
      S.addr = lc(a[0]); S.live = true; S.prov = w.provider; S.rdns = w.info.rdns || "";
      attach(w.provider);
      remember(S.addr, S.rdns);
      closeChooser();
      return w.provider.request({ method: "eth_chainId" }).then(function (c) { S.chain = parseInt(c, 16) || 0; }).catch(function () {});
    }).then(function () {
      paint(); emit(); morph();
      if (window.arcTxRing && window.arcTxRing.celebrate) window.arcTxRing.celebrate();
      return S.addr;
    });
  }
  api.disconnect = function () {
    closeMenu();
    if (appMode()) { ls.set(KEY, null); if (typeof disconnectWallet === "function") return Promise.resolve(disconnectWallet()); return Promise.resolve(); }
    var p = S.prov;
    S = { addr: "", live: false, prov: null, rdns: "", chain: 0 };
    forget();
    if (p && p.request) p.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(function () {});
    paint(); emit();
    return Promise.resolve();
  };
  function switchTo(net) {
    closeMenu();
    if (appMode()) {
      if (net === "arc" && typeof switchToArcNetwork === "function") return switchToArcNetwork();
      if (net === "rh" && typeof switchToAltNetwork === "function") return switchToAltNetwork();
      if (net === "sol" && typeof switchToSolana === "function") return switchToSolana();
      return;
    }
    var n = net === "rh" ? RH : ARC, p = S.prov;
    if (!p) return api.connect();
    var cfg = C(), pons = cfg.PONS || {};
    var add = net === "rh"
      ? { chainId: RH.hex, chainName: RH.name, rpcUrls: [pons.RPC || RH.rpc], blockExplorerUrls: [pons.EXPLORER || RH.expl], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }
      : { chainId: cfg.CHAIN_ID_HEX || ARC.hex, chainName: cfg.CHAIN_NAME || ARC.name, rpcUrls: [cfg.RPC_URL || ARC.rpc], blockExplorerUrls: [cfg.BLOCK_EXPLORER || ARC.expl], nativeCurrency: cfg.NATIVE_CURRENCY || { name: "USDC", symbol: "USDC", decimals: 18 } };
    return p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: n.hex }] }).catch(function (e) {
      if (e && (e.code === 4902 || /unrecognized|not added/i.test(e.message || ""))) return p.request({ method: "wallet_addEthereumChain", params: [add] });
    }).then(function () { return p.request({ method: "eth_chainId" }); }).then(function (c) { S.chain = parseInt(c, 16) || 0; paint(); }).catch(function () {});
  }

  // ---------------- the chooser (several browser wallets, or none) ----------------
  var ch = null;
  function closeChooser() { if (ch) { ch.remove(); ch = null; } }
  function chooser(list) {
    return new Promise(function (resolve) {
      closeChooser();
      ch = D.createElement("div");
      ch.className = "cw-modal";
      ch.setAttribute("role", "dialog"); ch.setAttribute("aria-modal", "true"); ch.setAttribute("aria-label", L("Connect a wallet", "지갑 연결", "连接钱包"));
      var here = location.host + location.pathname + location.search;
      var phone = /Android|iPhone|iPad/i.test(navigator.userAgent || "");
      var rows = list.map(function (w, i) {
        return '<button type="button" class="cw-w" data-i="' + i + '">' + (w.info.icon ? '<img src="' + esc(w.info.icon) + '" alt="" width="28" height="28">' : '<span class="cw-wi" aria-hidden="true"></span>') + "<b>" + esc(w.info.name) + '</b><small>' + esc(w.info.rdns === "app.arcircle.wallet" ? L("Email, Google, Apple or X", "이메일·구글·애플·X", "邮箱、Google、Apple 或 X") : L("Installed", "설치됨", "已安装")) + "</small></button>";
      }).join("");
      var apps = phone ? '<div class="cw-sec">' + esc(L("Open this page in a wallet app", "지갑 앱에서 이 페이지 열기", "在钱包应用中打开本页")) + '</div>' +
        '<a class="cw-w" href="https://metamask.app.link/dapp/' + esc(here) + '"><span class="cw-wi mm" aria-hidden="true"></span><b>MetaMask</b><small>' + esc(L("Open in the app", "앱에서 열기", "在应用中打开")) + "</small></a>" +
        '<a class="cw-w" href="https://go.cb-w.com/dapp?cb_url=' + esc(encodeURIComponent(location.href)) + '"><span class="cw-wi cb" aria-hidden="true"></span><b>Coinbase Wallet</b><small>' + esc(L("Open in the app", "앱에서 열기", "在应用中打开")) + "</small></a>" : "";
      ch.innerHTML = '<div class="cw-scrim" data-x></div><div class="cw-card">' +
        '<div class="cw-card-h"><b>' + esc(L("Connect a wallet", "지갑 연결", "连接钱包")) + '</b><button type="button" class="cw-x" data-x aria-label="' + esc(L("Close", "닫기", "关闭")) + '">×</button></div>' +
        (rows ? '<div class="cw-list">' + rows + "</div>" : '<p class="cw-none">' + esc(L("No wallet in this browser yet.", "이 브라우저에 지갑이 없어요.", "此浏览器还没有钱包。")) + "</p>") +
        apps +
        '<div class="cw-sec">' + esc(L("More ways", "다른 방법", "更多方式")) + "</div>" +
        '<a class="cw-w" href="/arc?connect=1' + esc(location.hash || "") + '"><span class="cw-wi wc" aria-hidden="true"></span><b>WalletConnect</b><small>' + esc(L("QR code, any wallet app", "QR 코드, 모든 지갑 앱", "二维码,任意钱包应用")) + "</small></a>" +
        // ARCIRCLE Wallet (email, Google, Apple or X): listed above where this page loads it, otherwise opened on /wallet
        (list.some(function (w) { return w.info && w.info.rdns === "app.arcircle.wallet"; }) ? "" : '<a class="cw-w" href="/wallet"><span class="cw-wi arc" aria-hidden="true"></span><b>ARCIRCLE Wallet</b><small>' + esc(L("Email, Google, Apple or X", "이메일·구글·애플·X", "邮箱、Google、Apple 或 X")) + "</small></a>") +
        "</div>";
      D.body.appendChild(ch);
      ch.addEventListener("click", function (e) {
        if (e.target.closest("[data-x]")) { closeChooser(); resolve(""); return; }
        var b = e.target.closest("[data-i]");
        if (b) use(list[Number(b.getAttribute("data-i"))]).then(resolve, function () { resolve(""); });
      });
      D.addEventListener("keydown", function k(e) { if (e.key === "Escape") { D.removeEventListener("keydown", k); closeChooser(); resolve(""); } });
      var first = ch.querySelector(".cw-w, .cw-x");
      if (first) first.focus();
    });
  }

  // ---------------- the button and its menu ----------------
  var root = null, btn = null, menu = null, claimN = 0, bal = null, balAt = 0, balFor = "";
  var ICON_W = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16" height="11" rx="2.5"/><circle cx="16" cy="13.5" r="1.2" fill="currentColor"/></svg>';
  var hue = function (a) { return (parseInt(String(a).slice(2, 8), 16) || 0) % 360; };
  function netOf(id) { return id === 5042 ? "arc" : id === 4663 ? "rh" : id ? "other" : ""; }
  function solOn() { try { return !!(window.arcSol && window.arcSol.selected && window.arcSol.selected()); } catch (e) { return false; } }
  function paint() {
    if (!btn) return;
    var a = api.address(), live = api.live(), net = netOf(chainId()), sol = appMode() && solOn();
    H.classList.toggle("cw-in", !!a);
    if (!a) {
      btn.className = "cw-b cw-off";
      btn.innerHTML = ICON_W + '<span class="cw-l">' + esc(L("Connect wallet", "지갑 연결", "连接钱包")) + '</span><span class="cw-s">' + esc(L("Connect", "연결", "连接")) + "</span>";
      btn.setAttribute("aria-label", L("Connect wallet", "지갑 연결", "连接钱包"));
      btn.setAttribute("aria-haspopup", "dialog");
      return;
    }
    var state_ = !live ? "rem" : sol ? "sol" : net === "arc" ? "ok" : net === "rh" ? "rh" : net ? "warn" : "ok";
    btn.className = "cw-b cw-on cw-" + state_;
    btn.innerHTML = '<span class="cw-av" style="--h:' + hue(a) + '" aria-hidden="true"></span><span class="cw-a" data-no-i18n>' + esc(short(a)) + '</span><i class="cw-dot" aria-hidden="true"></i>' + (claimN ? '<span class="cw-n" title="' + esc(L("Ready to claim", "받을 수 있는 보상", "可领取")) + '">' + claimN + "</span>" : "");
    btn.setAttribute("aria-label", L("Wallet", "지갑", "钱包") + " " + short(a));
    btn.setAttribute("aria-haspopup", "menu");
    if (menu && !menu.hidden) menuHtml();
  }
  function morph() {
    if (reduce || !btn) return;
    btn.classList.remove("cw-morph"); void btn.offsetWidth; btn.classList.add("cw-morph");
  }
  function rpc(url, calls) {
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls.map(function (c, i) { return { jsonrpc: "2.0", id: i, method: c[0], params: c[1] }; })) })
      .then(function (r) { return r.json(); }).then(function (j) { var m = {}; (Array.isArray(j) ? j : [j]).forEach(function (x) { m[x.id] = x.result; }); return calls.map(function (_, i) { return m[i]; }); });
  }
  function balances(a) {
    if (bal && balFor === a && Date.now() - balAt < 30000) return Promise.resolve(bal);
    var cfg = C(), tok = cfg.ARCIRCLE_TOKEN || ARC.token;
    return rpc(cfg.RPC_URL || ARC.rpc, [["eth_getBalance", [a, "latest"]], ["eth_call", [{ to: tok, data: "0x70a08231" + a.slice(2).padStart(64, "0") }, "latest"]]]).then(function (r) {
      var n = function (h, d) { try { return Number(BigInt(h || "0x0") / 10n ** BigInt(d - 4)) / 1e4; } catch (e) { return null; } };
      bal = { usdc: n(r[0], 18), arc: n(r[1], 18) }; balAt = Date.now(); balFor = a;
      return bal;
    }).catch(function () { return null; });
  }
  var nf = function (v, d) { return v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }); };
  function txs() { try { return JSON.parse(ls.get(TXK) || "[]"); } catch (e) { return []; } }
  function menuHtml() {
    var a = api.address(), live = api.live(), id = chainId(), net = netOf(id), app = appMode();
    var expl = (C().BLOCK_EXPLORER || ARC.expl) + "/address/" + a;
    var list = txs().filter(function (t) { return !t.from || t.from === a; }).slice(0, 6);
    var netRow = !live ? '<div class="cw-note">' + esc(L("Remembered from your last visit. Connect to sign.", "지난 방문에서 기억한 지갑이에요. 서명하려면 연결하세요.", "上次访问记住的钱包。需要签名时请连接。")) + ' <button type="button" class="cw-link" data-cw="connect">' + esc(L("Connect", "연결", "连接")) + "</button></div>"
      : '<div class="cw-net">' + [["arc", "Arc"], ["rh", "Robinhood"]].concat(app && typeof switchToSolana === "function" ? [["sol", "Solana"]] : []).map(function (n) {
        var on = n[0] === "sol" ? solOn() : !solOn() && net === n[0];
        return '<button type="button" data-cw="net" data-net="' + n[0] + '" aria-pressed="' + on + '"><i aria-hidden="true"></i>' + n[1] + "</button>";
      }).join("") + "</div>" + (net === "other" ? '<button type="button" class="cw-warn" data-cw="net" data-net="arc">' + esc(L("Wrong network — switch to Arc", "다른 네트워크 — Arc로 전환", "网络不对 — 切换到 Arc")) + "</button>" : "");
    menu.innerHTML =
      '<div class="cw-m-h"><span class="cw-av lg" style="--h:' + hue(a) + '" aria-hidden="true"></span><div><b data-no-i18n>' + esc(short(a)) + '</b><button type="button" class="cw-link" data-cw="copy">' + esc(L("Copy address", "주소 복사", "复制地址")) + "</button></div></div>" +
      netRow +
      '<div class="cw-bal" data-cw-bal><div><small>USDC · Arc</small><b data-no-i18n>' + (bal && balFor === a ? nf(bal.usdc, 2) : "…") + '</b></div><div><small>$ARCIRCLE</small><b data-no-i18n>' + (bal && balFor === a ? nf(bal.arc, 0) : "…") + "</b></div></div>" +
      '<a class="cw-i" href="/me?w=' + esc(a) + '"><span>' + esc(L("Ready to claim", "받을 수 있는 보상", "可领取")) + "</span>" + (claimN ? '<em class="cw-n">' + claimN + "</em>" : "<small>" + esc(L("My ARCIRCLE", "My ARCIRCLE", "My ARCIRCLE")) + "</small>") + "</a>" +
      '<a class="cw-i" href="/arc#portfolio"><span>' + esc(L("Portfolio", "포트폴리오", "资产")) + "</span></a>" +
      '<details class="cw-tx"' + (list.length ? "" : " hidden") + "><summary>" + esc(L("Recent transactions", "최근 거래", "最近交易")) + " <small>" + list.length + "</small></summary><ul>" +
        list.map(function (t) { return '<li class="' + esc(t.s) + '"><a href="' + esc(t.ex + "/tx/" + t.h) + '" target="_blank" rel="noopener"><i aria-hidden="true"></i><span data-no-i18n>' + esc(t.h.slice(0, 10) + "…" + t.h.slice(-4)) + "</span><small>" + esc(t.s === "ok" ? L("Confirmed", "완료", "已确认") : t.s === "fail" ? L("Failed", "실패", "失败") : L("Pending", "대기 중", "待确认")) + " · " + esc(ago(t.t)) + "</small></a></li>"; }).join("") +
      "</ul></details>" +
      '<a class="cw-i" href="' + esc(expl) + '" target="_blank" rel="noopener"><span>' + esc(L("View on explorer", "익스플로러에서 보기", "在浏览器中查看")) + " ↗</span></a>" +
      '<button type="button" class="cw-i cw-dis" data-cw="disconnect"><span>' + esc(L("Disconnect", "연결 해제", "断开连接")) + "</span></button>";
  }
  function ago(t) { var s = Math.max(1, (Date.now() - t) / 1000); return s < 3600 ? Math.round(s / 60) + "m" : s < 86400 ? Math.round(s / 3600) + "h" : Math.round(s / 86400) + "d"; }
  function openMenu() {
    if (!menu) return;
    menuHtml(); menu.hidden = false; btn.setAttribute("aria-expanded", "true");
    var a = api.address();
    balances(a).then(function () { if (!menu.hidden) menuHtml(); });
    claims();
  }
  function closeMenu() { if (menu && !menu.hidden) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); } }
  var claimAt = 0;
  function claims() {
    var a = api.address();
    if (!a || !window.arcV10 || !window.arcV10.claims || Date.now() - claimAt < 60000) return;
    claimAt = Date.now();
    window.arcV10.claims(a).then(function (rows) { claimN = rows.filter(function (r) { return r.ready && !r.other; }).length; paint(); }).catch(function () {});
  }
  api.mount = function () {
    var right = D.querySelector(".anav-right");
    if (!right) return;
    var have = right.querySelector(".cw");
    if (have && have.querySelector(".cw-b")) { root = have; return; }
    root = have || D.createElement("div");
    root.className = "cw";
    root.innerHTML = '<button type="button" class="cw-b"></button><div class="cw-m" role="menu" hidden></div>';
    if (!have) { var old = right.querySelector(".anav-wallet"); if (old) old.replaceWith(root); else right.appendChild(root); }
    btn = root.querySelector(".cw-b"); menu = root.querySelector(".cw-m");
    H.classList.add("cw-on");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!api.address()) { api.connect(); return; }
      if (menu.hidden) openMenu(); else closeMenu();
    });
    menu.addEventListener("click", function (e) {
      var t = e.target.closest("[data-cw]");
      if (!t) return;
      e.stopPropagation();
      var k = t.getAttribute("data-cw");
      if (k === "copy") { if (navigator.clipboard) navigator.clipboard.writeText(api.address()); t.textContent = L("Copied", "복사됨", "已复制"); setTimeout(function () { t.textContent = L("Copy address", "주소 복사", "复制地址"); }, 1200); }
      else if (k === "disconnect") api.disconnect();
      else if (k === "connect") { closeMenu(); api.connect(); }
      else if (k === "net") switchTo(t.getAttribute("data-net"));
    });
    D.addEventListener("click", function (e) { if (root && !root.contains(e.target)) closeMenu(); });
    D.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu && !menu.hidden) { closeMenu(); btn.focus(); } });
    // the bell sits next to the wallet on every page (ArcPad / CirclePad bring their own inside the bar already)
    if (!right.querySelector(".nb") && window.arcChrome && window.arcChrome.mountBell) window.arcChrome.mountBell(right, root);
    paint();
  };

  // ---------------- recent transactions (from the tx ring, arc-txring.js) ----------------
  D.addEventListener("arc:tx", function (e) {
    var d = e.detail || {};
    if (!d.h) return;
    var list = txs().filter(function (t) { return t.h !== d.h; });
    var prev = txs().find(function (t) { return t.h === d.h; });
    list.unshift({ h: d.h, s: d.s, t: prev ? prev.t : Date.now(), ex: d.ex || ARC.expl, from: api.address() });
    ls.set(TXK, JSON.stringify(list.slice(0, 20)));
    if (menu && !menu.hidden) menuHtml();
  });

  // ---------------- app pages: follow the page's own wallet ----------------
  function follow() {
    var last = null;
    setInterval(function () {
      if (!appMode()) return;
      var a = api.address(), key = a + "|" + chainId() + "|" + solOn();
      if (key === last) return;
      var was = last;
      last = key;
      if (a) remember(a); else if (was && ls.get(OFF) === "1") ls.set(KEY, null);
      if (a && was !== null && was.split("|")[0] === "") morph();
      paint(); emit(); claims();
    }, 500);
    // ArcPad's connect from another page: /arc?connect=1 opens it once the page is ready
    if (/[?&]connect=1\b/.test(location.search) && appMode()) {
      setTimeout(function () { if (!api.address()) api.connect(); try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) { /* fine */ } }, 1200);
    }
  }

  function init() {
    api.mount();
    restore();
    follow();
    setTimeout(claims, 2500);
    // the bar is rebuilt on a language change
    D.addEventListener("arc:lang", function () { setTimeout(function () { root = null; api.mount(); }, 80); });
    setInterval(function () { var r = D.querySelector(".anav-right"); if (r && !r.querySelector(".cw-b")) { root = null; api.mount(); } }, 1000);
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", function () { setTimeout(init, 0); }); else setTimeout(init, 0);
})();
