// world-lock.js — Game World's first beta: open to wallets holding at least 1,000,000 $ARCIRCLE on Arc (the Platform
// World stays open to everyone). The visitor connects a wallet and signs the free World sign-in message; the server
// (api/_world.mjs, world-gate) checks the signature and the balance on Arc. A pass is kept on this device for 12 hours,
// and the signature doubles as the game's sign-in, so the game doesn't ask again. This is the beta's front door, not
// a vault: the game's files are public like the rest of the site. To open the world to everyone, set OPEN = true.
//   window.arcWorldLock: { ok() → bool, ask({ cancelHref }) → Promise<bool>, need }
(function () {
  "use strict";
  var OPEN = false;
  var NEED = 1000000;
  var PASS = "arc.world.pass", SESS = "arc.world.sess", HOURS = 12;
  var lc = function (a) { return String(a || "").toLowerCase(); };
  function readPass() { try { var p = JSON.parse(localStorage.getItem(PASS) || "null"); return p && /^0x[0-9a-f]{40}$/.test(p.w) && p.until > Date.now() ? p : null; } catch (e) { return null; } }
  function ok() { return OPEN || !!readPass(); }
  var lang = (document.documentElement.getAttribute("lang") || "en").slice(0, 2);
  try { lang = localStorage.getItem("arcircle.lang") || lang; } catch (e) { /* private */ }
  var T = {
    ko: { tag: "첫 베타", h: "ARCIRCLE World", p: "첫 베타는 Arc에서 $ARCIRCLE을 1,000,000개 이상 보유한 지갑에 열려 있어요. 지갑을 연결하고 무료 메시지에 서명하면 확인돼요 — 아무것도 옮기지 않아요.", req: "입장 조건", reqv: "1,000,000 $ARCIRCLE 이상 보유 (Arc)", platl: "플랫폼", plat: "PC · 모바일", go: "지갑 연결하고 입장", busy: "$ARCIRCLE 보유량 확인 중…", sign: "지갑에서 서명해 주세요…", conn: "지갑 연결 중…", closed: "지갑 연결이 취소됐어요. 다시 눌러 주세요.", slow: "지갑에서 응답이 없어요. 다시 시도해 주세요.", phone: "휴대폰에서는 MetaMask·OKX·Coinbase 같은 지갑 앱 안의 브라우저로 arcircle.app을 열면 바로 연결돼요.", back: "플랫폼 월드로", low: "이 지갑은 {n} $ARCIRCLE을 보유하고 있어요. 베타 입장에는 1,000,000개가 필요해요.", other: "다른 지갑으로", err: "확인하지 못했어요: {e}", nowal: "지갑 연결을 쓸 수 없어요. 지갑 앱의 브라우저에서 열어 주세요.", welcome: "확인됐어요. 들어갑니다…", have: "보유", needw: "필요", pend: "지갑에 이미 열린 요청이 있어요. 브라우저 툴바의 지갑 아이콘(또는 지갑 앱)을 눌러 마저 진행해 주세요.", pc: "PC 브라우저(크롬·엣지·웨일 등)에서는 지갑 확장 프로그램을 쓰거나, 'WalletConnect'를 골라 휴대폰 지갑 앱으로 QR을 찍으면 돼요." },
    zh: { tag: "首次公测", h: "ARCIRCLE World", p: "首次公测向在 Arc 上持有至少 1,000,000 枚 $ARCIRCLE 的钱包开放。连接钱包并签署一条免费消息即可验证——不会转移任何资产。", req: "入场条件", reqv: "持有 1,000,000 枚以上 $ARCIRCLE（Arc）", platl: "平台", plat: "PC · 手机", go: "连接钱包并进入", busy: "正在核对 $ARCIRCLE 持有量…", sign: "请在钱包中签名…", conn: "正在连接钱包…", closed: "已取消连接钱包，请再试一次。", slow: "钱包没有响应，请重试。", phone: "在手机上，用 MetaMask、OKX、Coinbase 等钱包应用内的浏览器打开 arcircle.app 即可直接连接。", back: "去平台世界", low: "该钱包持有 {n} 枚 $ARCIRCLE。公测入场需要 1,000,000 枚。", other: "换一个钱包", err: "无法验证：{e}", nowal: "无法连接钱包。请在钱包应用的浏览器中打开。", welcome: "验证通过，正在进入…", have: "持有", needw: "需要", pend: "钱包里已有一个未完成的请求。请点击浏览器工具栏中的钱包图标（或钱包应用）完成它。", pc: "在电脑浏览器（Chrome、Edge 等）上，可使用钱包扩展，或选择“WalletConnect”用手机钱包扫码。" },
    en: { tag: "First beta", h: "ARCIRCLE World", p: "The first beta is open to wallets holding at least 1,000,000 $ARCIRCLE on Arc. Connect your wallet and sign a free message to check — it moves nothing.", req: "To enter", reqv: "Hold 1,000,000+ $ARCIRCLE on Arc", platl: "Platform", plat: "PC · Mobile", go: "Connect wallet to enter", busy: "Checking your $ARCIRCLE…", sign: "Sign in your wallet…", conn: "Connecting your wallet…", closed: "The wallet wasn't connected. Tap again to retry.", slow: "No answer from the wallet. Try again.", phone: "On a phone, open arcircle.app in your wallet app's browser (MetaMask, OKX, Coinbase…) to connect right away.", back: "Go to the Platform World", low: "This wallet holds {n} $ARCIRCLE. The beta needs 1,000,000.", other: "Try another wallet", err: "Couldn't check: {e}", nowal: "Wallet connect isn't available here. Open the site in your wallet app's browser.", welcome: "You're in. Opening the world…", have: "Holding", needw: "Needed", pend: "Your wallet already has a request open. Click the wallet's icon in the browser toolbar (or open the wallet app) to finish it.", pc: "On a computer (Chrome, Edge, Brave…), use a wallet extension, or pick WalletConnect and scan the QR code with your phone's wallet app." },
  }[lang === "ko" || lang === "zh" ? lang : "en"];
  var fmt = function (n) { try { return Number(n).toLocaleString(lang === "zh" ? "zh-CN" : lang === "ko" ? "ko-KR" : "en-US"); } catch (e) { return String(n); } };
  var msgOf = function (w, issued) { return "ARCIRCLE World — sign in\n\nWallet: " + lc(w) + "\nIssued: " + issued + "\n\nThis only proves the wallet is yours. It costs nothing and moves nothing."; };
  var hex = function (s) { return "0x" + Array.from(new TextEncoder().encode(s), function (b) { return b.toString(16).padStart(2, "0"); }).join(""); };

  // connect → sign → the server checks the balance
  function check(onStep) {
    var AC = window.arcConnect;
    if (!AC) return Promise.reject(new Error(T.nowal));
    onStep("conn");
    return Promise.resolve(AC.live && AC.live() ? null : AC.connect()).then(function () {
      var w = lc(AC.address && AC.address()); if (!w) { var x = new Error(T.closed); x.closed = true; throw x; }
      return Promise.resolve(AC.provider()).then(function (prov) {
        var issued = new Date().toISOString();
        onStep("sign");
        var slow = new Promise(function (_, no) { setTimeout(function () { no(new Error(T.slow)); }, 120000); });
        return Promise.race([prov.request({ method: "personal_sign", params: [hex(msgOf(w, issued)), w] }), slow]).then(function (signature) {
          onStep("busy");
          return fetch("/api/social", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "world-gate", wallet: w, issued: issued, signature: signature }) })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ("HTTP " + r.status)); return { j: j, w: w, issued: issued, signature: signature }; }); });
        });
      });
    });
  }

  function ask(o) {
    o = o || {};
    if (ok()) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var el = document.createElement("div");
      el.className = "wl"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "wl-h");
      el.innerHTML = '<div class="wl-gcard wl-pass" data-no-i18n>' +
        '<div class="wl-top"><div class="wl-rings" aria-hidden="true"><i></i><i></i><i></i></div><img src="/images/arcircle-mark-sm.png" alt="" width="58" height="34"><span class="wl-tag">' + T.tag + '</span></div>' +
        '<h2 id="wl-h">' + T.h + '</h2><p class="wl-lead">' + T.p + '</p>' +
        '<dl class="wl-req"><div><dt>' + T.req + '</dt><dd>' + T.reqv + '</dd></div><div><dt>' + T.platl + '</dt><dd class="wl-dev"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="14" height="10" rx="1.6"/><path d="M6 17.5h7"/><rect x="17.5" y="8" width="5" height="10" rx="1.2"/></svg>' + T.plat + '</dd></div></dl>' +
        '<div class="wl-meter" hidden><div class="wl-mrow"><span>' + T.have + ' <b class="wl-have">0</b></span><span>' + T.needw + ' <b>' + fmt(NEED) + '</b></span></div><i class="wl-bar"><b></b></i></div>' +
        '<p class="wl-bad" role="alert" hidden></p>' +
        (!window.ethereum ? '<p class="wl-hint">' + (/Android|iPhone|iPad/i.test(navigator.userAgent || "") ? T.phone : T.pc) + '</p>' : '') +
        '<div class="wl-gact"><button type="button" class="wl-go">' + T.go + '</button><a class="wl-back" href="' + (o.cancelHref || "#") + '">' + T.back + '</a></div></div>';
      document.body.appendChild(el);
      document.documentElement.classList.add("wl-open"); // the wallet chooser (arc-connect.js) opens above this card
      var go = el.querySelector(".wl-go"), bad = el.querySelector(".wl-bad"), meter = el.querySelector(".wl-meter");
      setTimeout(function () { go.focus(); }, 30);
      function done(v) { el.remove(); document.documentElement.classList.remove("wl-open"); document.removeEventListener("keydown", onKey, true); resolve(v); }
      function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); if (o.cancelHref) location.href = o.cancelHref; else done(false); } }
      document.addEventListener("keydown", onKey, true);
      el.querySelector(".wl-back").addEventListener("click", function (e) { if (!o.cancelHref) { e.preventDefault(); done(false); } });
      function say(t, good) { bad.textContent = t; bad.hidden = !t; bad.classList.toggle("good", !!good); }
      function shake() { var c = el.querySelector(".wl-gcard"); c.classList.remove("wl-shake"); void c.offsetWidth; c.classList.add("wl-shake"); }
      var busy = false;
      go.addEventListener("click", function () {
        if (busy) return; busy = true; say(""); go.disabled = true; go.textContent = T.busy;
        check(function (step) { go.textContent = step === "sign" ? T.sign : step === "conn" ? T.conn : T.busy; }).then(function (r) {
          var have = Number(r.j.balance) || 0;
          meter.hidden = false; el.querySelector(".wl-have").textContent = fmt(have);
          meter.querySelector(".wl-bar b").style.width = Math.min(100, (100 * have) / NEED) + "%";
          meter.classList.toggle("full", !!r.j.ok);
          if (r.j.ok) {
            try {
              localStorage.setItem(PASS, JSON.stringify({ w: r.w, until: Date.now() + HOURS * 3600e3 }));
              localStorage.setItem(SESS, JSON.stringify({ wallet: r.w, issued: r.issued, signature: r.signature }));
            } catch (x) { /* private window: this visit only */ }
            say(T.welcome, true); go.textContent = T.welcome;
            setTimeout(function () { done(true); }, 700);
            return;
          }
          busy = false; go.disabled = false; go.textContent = T.other;
          say(T.low.replace("{n}", fmt(have))); shake();
          try { if (window.arcConnect && window.arcConnect.disconnect) window.arcConnect.disconnect(); } catch (x) { /* keep going */ }
        }).catch(function (e) {
          busy = false; go.disabled = false; go.textContent = T.go;
          if (e && e.closed) { say(T.closed); return; }
          var m = (e && (e.shortMessage || e.message)) || String(e);
          if (e && (e.code === 4001 || /reject|denied|cancel/i.test(m))) { say(T.closed); return; }
          if (e && (e.code === -32002 || /already pending|already processing/i.test(m))) { say(T.pend); return; }
          say(m === T.slow || m === T.nowal ? m : T.err.replace("{e}", m)); shake();
        });
      });
    });
  }
  window.arcWorldLock = { ok: ok, ask: ask, need: NEED };
})();
