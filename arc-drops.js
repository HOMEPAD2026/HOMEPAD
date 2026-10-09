// arc-drops.js — /airdrops: every reward and airdrop ARCIRCLE PAD owes its community, where each one stands,
// and whether a given wallet is in it. Edit REWARDS below when something moves; CirclePad's delivery steps come from
// config-arc.js (CIRCLEPAD_DELIVERY), the same board CirclePad's own page shows.
(function () {
  "use strict";
  var D = document, H = D.documentElement;
  var lang = function () { var l = (H.getAttribute("lang") || "en").slice(0, 2); if (l !== "ko" && l !== "zh") { try { l = localStorage.getItem("arcircle.lang") || l; } catch (e) { /* private mode */ } } return l === "ko" || l === "zh" ? l : "en"; };
  if (lang() !== "en") H.setAttribute("lang", lang()); // this page has no site-wide translator: the menu follows too
  var L = function (en, ko, zh) { var l = lang(); return l === "ko" ? ko : l === "zh" ? zh : en; };
  var esc = function (x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var isAddr = function (a) { return /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim()); };
  var C = window.CONFIG || {};
  var DEL = (C.CIRCLEPAD_DELIVERY && C.CIRCLEPAD_DELIVERY[3]) || {};
  var EXPL = { rh: "https://robinhoodchain.blockscout.com/tx/", sol: "https://solscan.io/tx/", arc: "https://arc.etherscan.io/tx/" }; // as circlepad-plan.js

  // status: "live" (running now) | "prep" (being prepared) | "soon" (announced, not started) | "done"
  var REWARDS = [
    { id: "r34", status: DEL.drop && DEL.drop.status === "done" ? "done" : "prep", rounds: [2, 3],
      t: ["CirclePad Rounds #3 + #4", "CirclePad 라운드 #3 + #4", "CirclePad 第 3 + 4 轮"],
      what: ["$ARCIA on Robinhood Chain, bought with the raise, plus your share of Round #4 on Solana.", "모금액으로 산 Robinhood Chain의 $ARCIA, 그리고 솔라나 라운드 #4 지분.", "用募资买入的 Robinhood Chain $ARCIA,加上 Solana 第 4 轮的份额。"],
      who: ["Everyone who contributed to Round #3, and Round #2's contributors (Round #2's USDC moved into Round #3) — pro rata to your share.", "라운드 #3 기여자 전원, 그리고 라운드 #2 기여자(라운드 #2 USDC가 #3로 이동) — 기여 비율대로.", "第 3 轮所有贡献者,以及第 2 轮贡献者(第 2 轮的 USDC 已转入第 3 轮)——按份额比例。"],
      how: ["A snapshot airdrop to the contributor list, at the right time — nothing to claim.", "적절한 시점에 기여자 명단으로 스냅샷 에어드랍 — 클레임할 필요 없어요.", "在合适的时机按贡献者名单快照空投——无需领取。"],
      steps: [["snap", ["Snapshot of the contributor list", "기여자 명단 스냅샷", "贡献者名单快照"]], ["drop", ["Airdrop: $ARCIA + the Round #4 share", "에어드랍: $ARCIA + 라운드 #4 지분", "空投:$ARCIA + 第 4 轮份额"]], ["more", ["Round #4 on Solana, and what follows", "솔라나 라운드 #4와 이후 업데이트", "Solana 第 4 轮及后续"]]],
      link: ["/circle", ["See the round", "라운드 보기", "查看本轮"]] },
    { id: "relay", status: "live",
      t: ["Relay Launch", "릴레이 런치", "接力发币"],
      what: ["Each CirclePad round's coin: its first buy is relayed to the round's contributors and to $ARCIRCLE holders.", "CirclePad 라운드마다 나오는 코인의 첫 매수분이 기여자와 $ARCIRCLE 홀더에게 전달돼요.", "每轮 CirclePad 的代币:首笔买入会接力发给贡献者和 $ARCIRCLE 持有者。"],
      who: ["Wallets holding 100,000+ $ARCIRCLE at each relay's snapshot.", "릴레이 스냅샷 시점에 $ARCIRCLE 100,000개 이상 보유한 지갑.", "每次接力快照时持有 100,000+ $ARCIRCLE 的钱包。"],
      how: ["Sent with the Multisender after each round's coin launches.", "라운드 코인 런치 후 멀티센더로 전송.", "每轮代币发行后通过批量转账发送。"],
      holder: 100000, link: ["/relay", ["Check my relay", "내 릴레이 확인", "查看我的接力"]] },
    { id: "vearcia", status: "live",
      t: ["veARCIA rewards", "veARCIA 보상", "veARCIA 奖励"],
      what: ["$ARCIA streamed every second to everyone staking $ARCIA.", "$ARCIA를 스테이킹한 모두에게 매초 $ARCIA가 지급돼요.", "向所有质押 $ARCIA 的人每秒发放 $ARCIA。"],
      who: ["veARCIA stakers, by their veARCIA.", "veARCIA 스테이커, veARCIA 비율대로.", "veARCIA 质押者,按 veARCIA 比例。"],
      how: ["Claim any time on the veARCIA page.", "veARCIA 페이지에서 언제든 클레임.", "随时在 veARCIA 页面领取。"],
      link: ["/arc#vearcia", ["Open veARCIA", "veARCIA 열기", "打开 veARCIA"]] },
    { id: "launchdrop", status: isAddr(C.LAUNCHDROP_ADDRESS) ? "live" : "soon",
      t: ["Launch Drop", "런치 드랍", "发币空投"],
      what: ["4% of every new ArcPad coin's supply (40M of 1B), held and paid out by a contract.", "새 ArcPad 코인마다 공급량의 4%(10억 개 중 4천만 개)를 컨트랙트가 보관하고 지급해요.", "每个新 ArcPad 币供应量的 4%(10 亿中的 4000 万),由合约保管并发放。"],
      who: ["veARCIRCLE holders, pro rata to their veARCIRCLE when the coin's launch week began (Thursday 00:00 UTC).", "veARCIRCLE 보유자 — 코인이 런칭된 주가 시작된 시점(목요일 00:00 UTC)의 veARCIRCLE 비율대로.", "veARCIRCLE 持有者——按该币上线当周开始时(周四 00:00 UTC)的 veARCIRCLE 比例。"],
      how: ["Claim on the Staking page any time, or anyone can send it to you. Coins launched from 8 Oct 2026 on.", "스테이킹 페이지에서 언제든 수령하거나, 누구나 대신 보내줄 수 있어요. 2026년 10월 8일 이후 런칭된 코인부터.", "随时在质押页面领取,任何人也可以代你发送。适用于 2026 年 10 月 8 日起上线的币。"],
      link: ["/arc#staking", ["Open Staking", "스테이킹 열기", "打开质押"]] },
  ];
  var ST = { live: ["Live", "진행 중", "进行中"], prep: ["Preparing", "준비 중", "准备中"], soon: ["Coming soon", "곧 시작", "即将开始"], done: ["Done", "완료", "已完成"] };
  var STEP = { "": ["Waiting", "대기", "等待"], now: ["In progress", "진행 중", "进行中"], done: ["Done", "완료", "已完成"] };
  var X = function (a) { return L(a[0], a[1], a[2]); };

  var root = D.getElementById("dr-out");
  if (!root) return;
  var mine = {};

  function card(r) {
    var steps = r.steps ? '<ol class="dr-steps">' + r.steps.map(function (s) {
      var d = DEL[s[0]] || {}, st = d.status || "";
      var txs = (d.txs || []).map(function (x) { return '<a href="' + esc((EXPL[x.chain] || EXPL.arc) + x.hash) + '" target="_blank" rel="noopener">' + esc(x.label || "tx") + " ↗</a>"; }).join(" ");
      return '<li class="s-' + (st || "wait") + '"><i aria-hidden="true"></i><span>' + esc(X(s[1])) + "</span><em>" + esc(X(STEP[st] || STEP[""])) + "</em>" + (txs ? "<div>" + txs + "</div>" : "") + "</li>";
    }).join("") + "</ol>" : "";
    var you = mine[r.id];
    return '<article class="dr-c" id="' + r.id + '"><div class="dr-top"><h2>' + esc(X(r.t)) + '</h2><span class="dr-st st-' + r.status + '">' + esc(X(ST[r.status])) + "</span></div>" +
      '<dl><div><dt>' + esc(L("What", "무엇을", "内容")) + "</dt><dd>" + esc(X(r.what)) + "</dd></div><div><dt>" + esc(L("Who", "누가", "谁")) + "</dt><dd>" + esc(X(r.who)) + "</dd></div><div><dt>" + esc(L("How", "어떻게", "方式")) + "</dt><dd>" + esc(X(r.how)) + "</dd></div></dl>" +
      steps + (you ? '<p class="dr-you ' + (you.ok ? "ok" : "no") + '">' + you.html + "</p>" : "") +
      '<a class="dr-go" href="' + esc(r.link[0]) + '">' + esc(X(r.link[1])) + " →</a></article>";
  }
  function paint() {
    root.innerHTML = REWARDS.map(card).join("");
    var h = D.getElementById("dr-h"), p = D.getElementById("dr-lede"), lab = D.getElementById("dr-lab"), go = D.getElementById("dr-go"), w = D.getElementById("dr-w");
    if (h) h.textContent = L("Rewards & airdrops", "보상 & 에어드랍", "奖励与空投");
    if (p) p.textContent = L("Everything ARCIRCLE PAD owes its community, and where each one stands. Delayed ones aren't forgotten — they go out when the time is right, and this page shows it first.", "ARCIRCLE PAD가 커뮤니티에 약속한 모든 보상과 진행 상황이에요. 미뤄진 것도 잊지 않았어요 — 적절한 시점에 지급되고, 이 페이지에 가장 먼저 표시돼요.", "ARCIRCLE PAD 对社区承诺的所有奖励及进度。延迟的不会被忘记——会在合适的时机发放,并最先在此页显示。");
    if (lab) lab.textContent = L("Check a wallet", "지갑 확인", "查询钱包");
    if (go) go.textContent = L("Check", "확인", "查询");
    if (w) w.placeholder = L("Wallet address (0x…)", "지갑 주소 (0x…)", "钱包地址 (0x…)");
  }
  var getJson = function (u) { return fetch(u, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  function check(addr) {
    addr = String(addr || "").trim().toLowerCase();
    var msg = D.getElementById("dr-msg");
    if (!isAddr(addr)) { if (msg) msg.textContent = L("That doesn't look like a wallet address.", "지갑 주소 형식이 아니에요.", "这不像钱包地址。"); return; }
    if (msg) msg.textContent = L("Reading this wallet…", "지갑을 읽는 중…", "正在读取钱包…");
    try { history.replaceState(null, "", "/airdrops?w=" + addr); } catch (e) { /* fine */ }
    Promise.all([getJson("/api/social?circle=lb&round=2&wallet=" + addr), getJson("/api/social?circle=lb&round=3&wallet=" + addr), getJson("/api/social?token=arcircle&wallet=" + addr), getJson("/api/desk?stake=drop&u=" + addr)]).then(function (res) {
      var parts = [], any = false;
      [[2, res[0]], [3, res[1]]].forEach(function (x) {
        var lb = x[1]; if (!lb || !lb.rows) return;
        var tot = lb.rows.reduce(function (s, r) { return s + Number(r.amount) / 1e18; }, 0);
        var row = lb.rows.find(function (r) { return String(r.address).toLowerCase() === addr; });
        if (row) { any = true; var a = Number(row.amount) / 1e18; parts.push(L("Round #", "라운드 #", "第 ") + x[0] + L(": ", ": ", " 轮:") + a.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDC" + (tot ? " (" + (a / tot * 100).toFixed(2) + "%)" : "")); }
      });
      mine.r34 = any ? { ok: true, html: "✓ " + esc(L("This wallet is in — ", "이 지갑은 대상이에요 — ", "该钱包在名单中 — ") + parts.join(" · ")) } : { ok: false, html: esc(L("This wallet isn't on the Round #2 or #3 contributor list.", "이 지갑은 라운드 #2·#3 기여자 명단에 없어요.", "该钱包不在第 2、3 轮贡献者名单中。")) };
      var w = res[2] && res[2].wallet, bal = w ? Number(w.balance || 0) : null;
      if (bal != null) mine.relay = bal >= 100000 ? { ok: true, html: "✓ " + esc(L("Holds ", "보유 ", "持有 ") + Math.floor(bal).toLocaleString("en-US") + " $ARCIRCLE — " + L("in the next relay while it holds.", "보유하는 동안 다음 릴레이 대상이에요.", "持有期间可参与下一次接力。")) }
        : { ok: false, html: esc(L("Holds ", "보유 ", "持有 ") + Math.floor(bal).toLocaleString("en-US") + " $ARCIRCLE — " + L("100,000 needed for the relay.", "릴레이는 100,000개 필요해요.", "接力需要 100,000 枚。")) };
      var ld = res[3];
      if (ld && ld.mode === "vault") {
        var n = (ld.claimable || []).length, sh = ld.me ? Number(ld.me.share) || 0 : 0, nx = ld.me ? Number(ld.me.shareNext) || 0 : 0;
        mine.launchdrop = n ? { ok: true, html: "✓ " + esc(n + L(n === 1 ? " coin ready to claim on the Staking page." : " coins ready to claim on the Staking page.", "개 코인을 스테이킹 페이지에서 수령할 수 있어요.", " 个币可在质押页面领取。")) }
          : sh || nx ? { ok: true, html: "✓ " + esc(L("Holds veARCIRCLE — ", "veARCIRCLE 보유 중 — ", "持有 veARCIRCLE — ") + ((sh || nx) * 100).toFixed(2) + "%" + L(" of each new coin's drop.", " 만큼 새 코인 드랍을 받아요.", " 的新币空投份额。")) }
          : { ok: false, html: esc(L("No veARCIRCLE yet — lock $ARCIRCLE to be in the next coins' drops.", "아직 veARCIRCLE이 없어요 — $ARCIRCLE을 락업하면 다음 코인부터 받아요.", "还没有 veARCIRCLE——锁仓 $ARCIRCLE 即可参与之后的新币空投。")) };
      }
      if (msg) msg.textContent = "";
      paint();
    });
  }
  D.getElementById("dr-f").addEventListener("submit", function (e) { e.preventDefault(); check(D.getElementById("dr-w").value); });
  var mineBtn = D.getElementById("dr-mine");
  if (mineBtn) mineBtn.addEventListener("click", function () {
    var W = window.arcConnect; // v11: the site's one wallet button
    if (W) { Promise.resolve(W.address() && W.live() ? null : W.connect()).then(function () { var a = W.address(); if (a) { D.getElementById("dr-w").value = a; check(a); } }).catch(function () { /* declined */ }); return; }
    var eth = window.ethereum; if (!eth) { D.getElementById("dr-msg").textContent = L("No wallet found in this browser — paste the address instead.", "이 브라우저에 지갑이 없어요 — 주소를 붙여 넣어 주세요.", "此浏览器没有钱包——请粘贴地址。"); return; }
    eth.request({ method: "eth_requestAccounts" }).then(function (a) { if (a && a[0]) { D.getElementById("dr-w").value = a[0]; check(a[0]); } }).catch(function () { /* declined */ });
  });
  D.addEventListener("arc:lang", paint);
  new MutationObserver(paint).observe(H, { attributes: true, attributeFilter: ["lang"] });
  paint();
  var q = new URLSearchParams(location.search).get("w");
  if (isAddr(q)) { D.getElementById("dr-w").value = q; check(q); }
  else setTimeout(function () { var a = window.arcConnect && window.arcConnect.address(); if (a && !D.getElementById("dr-w").value) { D.getElementById("dr-w").value = a; check(a); } }, 700);
})();
