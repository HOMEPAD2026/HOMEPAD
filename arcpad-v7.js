/* global ARC, ACT, CONFIG, arcActStats, arcAnyStats, arcAllCoins, arcChangeSinceLaunch, actTs, arcPriceInQuote, arcpadSnapshot,
          renderArcpadExploreGrid, arcExploreSort, fmtUsd */
// arcpad-v7.js — ArcPad v7 (arcpad.html), on top of v6 (arcpad-v6.js). The coin page, creator profiles, compare and
// the portfolio additions are in arcpad-v7-coin.js.
//   Shell    the sidebar in four groups that fold (Trade · Tools · ARCIA · ARCIRCLE — the open tab's group opens by
//            itself), "New" badges that drop a week after they went up, room at the bottom for the phone bars
//   Home     stat cards with a sparkline and their change (launches by day over 7 days, volume and trades by hour over
//            24 h), Featured creators (veARCIA Gold and Diamond), the crown passing from the last King of the Hill
//   Explore  "updated n s ago", list columns that sort (tap again to flip), saved filter presets, new coins push in
//            (FLIP), the first-minute badge on coins whose first minute of buying took a big share of the supply
//   Launch   two columns on a wide screen (the steps · a sticky preview with what it costs), each step checks its own
//            fields before moving on, the fee slider says its value, platform cards with a comparison table, the page
//            takes the platform's colour, a scheduled launch's last 10 seconds count down and end in its logo's confetti
//   Motion   skeletons fade into the data, long-press a coin on a phone for a quick buy — all of it off with
//            prefers-reduced-motion
(function () {
  "use strict";
  if (typeof ARC === "undefined") return;
  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  // labels used here only (kept out of the shared dictionary so one word can't clash with another page's)
  const L = {
    ko: { "Updated": "업데이트", "s ago": "초 전", "min ago": "분 전", "Server data": "서버 데이터", "Live": "실시간", "Presets": "프리셋", "Save this view": "이 보기 저장", "Name it": "이름", "Save": "저장", "Remove preset": "프리셋 삭제",
      "this week": "이번 주", "vs yesterday": "어제 대비", "last 12h vs the 12h before": "최근 12시간 vs 이전 12시간", "7 days": "7일", "24 hours": "24시간", "Featured creators": "추천 크리에이터", "veARCIA Gold and Diamond creators — their best coin right now": "veARCIA 골드·다이아몬드 크리에이터 — 지금 가장 좋은 코인",
      "View profile": "프로필 보기", "dethroned": "왕좌에서 내려옴", "First minute": "첫 1분", "of the supply bought in the first minute": "첫 1분 동안 매수된 공급량", "Compare": "비교", "Add to compare": "비교에 추가", "Remove from compare": "비교에서 빼기", "Compare now": "지금 비교", "Clear": "지우기",
      "What it costs": "비용", "Launch fee": "런치 수수료", "Dev buy": "개발자 매수", "Total": "합계", "plus a little gas": "+ 약간의 가스비", "Your add-on fee": "추가 수수료", "of every trade, 100% yours": "모든 거래의, 100% 내 몫", "Opening buy": "오프닝 매수", "Minimum": "최소",
      "Buy / sell tax": "매수 / 매도 세금", "Signatures": "서명", "Creator tax": "크리에이터 세금", "Pons launch fee": "Pons 런치 수수료", "in ETH, read when you launch": "ETH, 런치 시 확인", "Accounts & fees": "계정·수수료", "about 0.03 SOL": "약 0.03 SOL", "Checklist": "체크리스트",
      "Name": "이름", "Ticker": "티커", "Logo": "로고", "optional": "선택", "Compare platforms": "플랫폼 비교", "Chain": "체인", "Trades on": "거래 방식", "To launch": "런치 비용", "Creator fees": "크리에이터 수수료", "Graduates": "졸업", "Wallet": "지갑",
      "Give it a name.": "이름을 입력하세요.", "Give it a ticker.": "티커를 입력하세요.", "Letters and numbers only, up to 10.": "영문·숫자만, 최대 10자.", "That isn't an image link (https://… or an upload).": "이미지 링크가 아니에요 (https://… 또는 업로드).",
      "That isn't a link (https://…).": "링크가 아니에요 (https://…).", "That's not an X link (x.com/…).": "X 링크가 아니에요 (x.com/…).", "That's not a Telegram link (t.me/…).": "텔레그램 링크가 아니에요 (t.me/…).", "That's not a Discord link.": "디스코드 링크가 아니에요.",
      "Dev buy must be a number.": "개발자 매수는 숫자여야 해요.", "Paste the pair token's address (0x…).": "페어 토큰 주소를 붙여 넣으세요 (0x…).", "Launching!": "런치!", "Quick buy": "빠른 매수", "Open coin": "코인 열기", "Long-press a coin for a quick buy": "코인을 길게 눌러 빠른 매수", "Sort by": "정렬", "Fix this step first": "이 단계를 먼저 고치세요" },
    zh: { "Updated": "更新于", "s ago": "秒前", "min ago": "分钟前", "Server data": "服务器数据", "Live": "实时", "Presets": "预设", "Save this view": "保存此视图", "Name it": "名称", "Save": "保存", "Remove preset": "删除预设",
      "this week": "本周", "vs yesterday": "较昨日", "last 12h vs the 12h before": "近 12 小时 vs 之前 12 小时", "7 days": "7 天", "24 hours": "24 小时", "Featured creators": "精选创作者", "veARCIA Gold and Diamond creators — their best coin right now": "veARCIA 黄金与钻石创作者——他们当前最好的币",
      "View profile": "查看主页", "dethroned": "失去王座", "First minute": "首分钟", "of the supply bought in the first minute": "首分钟买走的供应量", "Compare": "对比", "Add to compare": "加入对比", "Remove from compare": "移出对比", "Compare now": "立即对比", "Clear": "清除",
      "What it costs": "费用", "Launch fee": "发射费", "Dev buy": "开发者买入", "Total": "合计", "plus a little gas": "另加少量 gas", "Your add-on fee": "附加费", "of every trade, 100% yours": "每笔交易,100% 归你", "Opening buy": "开盘买入", "Minimum": "最低",
      "Buy / sell tax": "买 / 卖税", "Signatures": "签名", "Creator tax": "创作者税", "Pons launch fee": "Pons 发射费", "in ETH, read when you launch": "以 ETH 计,发射时读取", "Accounts & fees": "账户与费用", "about 0.03 SOL": "约 0.03 SOL", "Checklist": "检查清单",
      "Name": "名称", "Ticker": "代码", "Logo": "图标", "optional": "可选", "Compare platforms": "对比平台", "Chain": "链", "Trades on": "交易方式", "To launch": "发射成本", "Creator fees": "创作者费用", "Graduates": "毕业", "Wallet": "钱包",
      "Give it a name.": "请填写名称。", "Give it a ticker.": "请填写代码。", "Letters and numbers only, up to 10.": "仅限字母和数字,最多 10 个。", "That isn't an image link (https://… or an upload).": "这不是图片链接(https://… 或上传)。",
      "That isn't a link (https://…).": "这不是链接(https://…)。", "That's not an X link (x.com/…).": "这不是 X 链接(x.com/…)。", "That's not a Telegram link (t.me/…).": "这不是 Telegram 链接(t.me/…)。", "That's not a Discord link.": "这不是 Discord 链接。",
      "Dev buy must be a number.": "开发者买入必须是数字。", "Paste the pair token's address (0x…).": "请粘贴配对代币地址(0x…)。", "Launching!": "发射!", "Quick buy": "快速买入", "Open coin": "打开币", "Long-press a coin for a quick buy": "长按币快速买入", "Sort by": "排序", "Fix this step first": "请先修正这一步" },
  };
  const lang = () => (window.arcI18n && window.arcI18n.get && window.arcI18n.get()) || "en";
  const V = (s) => esc((L[lang()] && L[lang()][s]) || tr(s));
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const usd = (n) => (n == null || !isFinite(n) ? "—" : typeof fmtUsd === "function" ? fmtUsd(n) : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const store = { get: (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } } };
  const coins = () => (typeof arcAllCoins === "function" ? arcAllCoins() : ARC.launches || []);
  const statsOf = (l) => (typeof arcAnyStats === "function" ? arcAnyStats(l) : null);
  const safeImg = (u) => /^https?:\/\//i.test(u || "") || /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(u || "");
  const logoHtml = (l, cls) => (safeImg(l.imageUrl) ? `<img class="${cls}" src="${esc(l.imageUrl)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
    : `<span class="${cls} ph" style="${typeof window.arcAvatarBg === "function" && l.platform !== "pump" ? window.arcAvatarBg(l.token) : ""}">${esc(String(l.symbol || "?").slice(0, 1).toUpperCase())}</span>`);
  const activeTab = () => { const p = document.querySelector(".bp-panel.active"); return p ? p.id.replace("bp-panel-", "") : ""; };
  const spark = (pts, w = 96, h = 28) => {
    if (!pts || pts.length < 2) return "";
    const lo = Math.min(...pts), hi = Math.max(...pts), k = hi - lo || 1;
    const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * w).toFixed(1)} ${(h - 2 - ((v - lo) / k) * (h - 4)).toFixed(1)}`).join(" ");
    return `<svg class="v7-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${w} ${h} L0 ${h} Z" class="a"/><path d="${d}" class="l"/></svg>`;
  };

  // =====================================================================
  // Shell: sidebar groups, New badges, room for the phone bars
  // =====================================================================
  const GKEY = "arcpad.navgroups.v1";
  function paintGroups(openFor) {
    const shut = new Set(store.get(GKEY, []));
    if (openFor) { const nav = document.querySelector(`.bp-nav-item[data-tab="${openFor}"]`); const g = nav && nav.closest("[data-grp]"); if (g && shut.delete(g.dataset.grp)) store.set(GKEY, [...shut]); }
    document.querySelectorAll(".bp-grp").forEach((b) => {
      const k = b.dataset.grp, nav = $("bp-grp-" + k); if (!nav) return;
      const open = !shut.has(k);
      b.setAttribute("aria-expanded", open ? "true" : "false");
      nav.classList.toggle("v7-shut", !open);
      const act = nav.querySelector(".bp-nav-item.active");
      b.classList.toggle("has-active", !!act && !open);
      let n = b.querySelector(".bp-grp-n");
      if (!n) { n = document.createElement("em"); n.className = "bp-grp-n"; n.setAttribute("data-no-i18n", ""); b.insertBefore(n, b.querySelector(".bp-grp-chev")); }
      n.textContent = open ? "" : String(nav.querySelectorAll(".bp-nav-item").length);
    });
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".bp-grp"); if (!b) return;
    const shut = new Set(store.get(GKEY, [])), k = b.dataset.grp;
    if (shut.has(k)) shut.delete(k); else shut.add(k);
    store.set(GKEY, [...shut]);
    const nav = $("bp-grp-" + k);
    if (nav && !reduce) { nav.classList.remove("v7-unfold"); void nav.offsetWidth; if (!shut.has(k)) nav.classList.add("v7-unfold"); }
    paintGroups();
  });
  function newBadges() {
    document.querySelectorAll(".bp-nav-item[data-new]").forEach((b) => {
      const d = Date.parse(b.dataset.new + "T00:00:00Z");
      if (!isFinite(d) || Date.now() - d <= 7 * 86400e3) return;
      const em = b.querySelector(".bp-nav-new"); if (!em) return;
      if (/^new$/i.test(em.textContent.trim())) em.remove(); else em.classList.remove("bp-nav-new");
    });
  }
  // the phone's fixed bars (quick bar, dock, ARCIA): the page ends above them, never under them
  function bottomRoom() {
    let h = 0;
    for (const el of document.querySelectorAll("nav.ax-dock, nav.ax-quick, .aa-fab, #aa-fab")) {
      const cs = getComputedStyle(el); if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect(); if (r.height && r.top > innerHeight * 0.5) h = Math.max(h, innerHeight - r.top);
    }
    document.documentElement.style.setProperty("--v7-bottom", Math.round(Math.min(h, 180)) + "px");
  }

  // =====================================================================
  // Home: stat sparklines, Featured creators, the crown passing on
  // =====================================================================
  function hourly(fn) { // 24 hourly buckets of fn(rec, launch) from the activity window
    const out = Array(24).fill(0);
    if (typeof ACT === "undefined" || !ACT.recs || !ACT.pools || ACT.hi == null) return null;
    const now = Date.now() / 1000;
    for (const r of ACT.recs) {
      const l = ACT.pools.get(r.p); if (!l || l.quoteDecimals == null) continue;
      const ts = typeof actTs === "function" ? actTs(r.b) : null; if (ts == null) continue;
      const k = 23 - Math.floor((now - ts) / 3600); if (k < 0 || k > 23) continue;
      out[k] += fn(r, l);
    }
    return out;
  }
  function recUsd(r, l) {
    const tokenIs0 = !l.quoteIsCurrency0, a = BigInt(tokenIs0 ? r.a1 : r.a0), q = Number(a < 0n ? -a : a) / Math.pow(10, l.quoteDecimals ?? 6);
    return l.quoteUsd != null ? q * l.quoteUsd : 0;
  }
  function daily() { // launches per day, last 7 days (oldest first) — every platform
    const out = Array(7).fill(0), now = Date.now() / 1000;
    for (const l of coins()) { if (!l.launchedAt) continue; const k = 6 - Math.floor((now - l.launchedAt) / 86400); if (k >= 0 && k <= 6) out[k]++; }
    return out;
  }
  const deltaHtml = (v, unit, title) => (v == null || !isFinite(v) ? "" : `<em class="v7-delta ${v > 0 ? "up" : v < 0 ? "dn" : ""}" title="${V(title)}" data-no-i18n>${v > 0 ? "▲" : v < 0 ? "▼" : "•"} ${unit === "%" ? (Math.abs(v) > 999 ? "999%+" : Math.abs(v).toFixed(0) + "%") : (v > 0 ? "+" : "") + v}</em>`);
  function paintStats() {
    const row = $("ap-home-stats"); if (!row) return;
    const cards = row.querySelectorAll(".ap-stat");
    const d = daily(), vol = hourly(recUsd), trades = hourly(() => 1);
    const pctOf = (a) => { if (!a) return null; const x = a.slice(12).reduce((s, v) => s + v, 0), y = a.slice(0, 12).reduce((s, v) => s + v, 0); return y > 0 ? ((x - y) / y) * 100 : x > 0 ? 100 : null; };
    let cum = coins().length - d.reduce((s, v) => s + v, 0);
    const growth = d.map((v) => (cum += v));
    const sets = [
      [spark(growth), deltaHtml(d.reduce((s, v) => s + v, 0), "", "this week"), "7 days"],
      [vol ? spark(vol) : "", deltaHtml(pctOf(vol), "%", "last 12h vs the 12h before"), "24 hours"],
      [spark(d), deltaHtml(d[6] - d[5], "", "vs yesterday"), "7 days"],
      [trades ? spark(trades) : "", deltaHtml(pctOf(trades), "%", "last 12h vs the 12h before"), "24 hours"],
    ];
    cards.forEach((c, i) => {
      const s = sets[i]; if (!s) return;
      let x = c.querySelector(".v7-stat-x");
      if (!x) { x = document.createElement("span"); x.className = "v7-stat-x"; c.appendChild(x); c.classList.add("v7-stat"); }
      const html = `${s[0]}<span class="v7-stat-f">${s[1]}<small>${V(s[2])}</small></span>`;
      if (x.__h !== html) { x.innerHTML = html; x.__h = html; }
    });
  }
  // Featured: creators with a veARCIA Gold or Diamond stake, by their best coin
  const FT = { tiers: {}, at: 0, busy: false };
  async function loadTiers(list) {
    const want = list.filter((a) => FT.tiers[a] == null).slice(0, 24);
    if (!want.length || FT.busy) return;
    FT.busy = true;
    try { const r = await fetch(`/api/social?vetiers=${want.join(",")}`); const j = r.ok ? await r.json() : null; if (j && j.tiers) Object.assign(FT.tiers, j.tiers); for (const a of want) if (FT.tiers[a] == null) FT.tiers[a] = 0; } catch { /* next time */ }
    FT.busy = false; FT.at = Date.now();
  }
  const TIER = ["", "Bronze", "Silver", "Gold", "Diamond"];
  window.arcVeTiers = FT.tiers;
  window.arcLoadTiers = loadTiers;
  async function paintFeatured() {
    const home = $("bp-panel-home"); if (!home) return;
    let box = $("v7-feat");
    if (!box) { box = document.createElement("section"); box.id = "v7-feat"; box.className = "v7-feat"; box.hidden = true; const tr0 = $("v6-trend"); if (tr0) tr0.after(box); else return; }
    const best = new Map();
    for (const l of coins()) { const c = lc(l.creator); if (!isAddr(c)) continue; const b = best.get(c); if (!b || (l.marketCapUsd || 0) > (b.marketCapUsd || 0)) best.set(c, l); }
    const list = [...best.entries()].sort((a, b) => (b[1].marketCapUsd || 0) - (a[1].marketCapUsd || 0)).map(([c]) => c);
    await loadTiers(list);
    const top = list.filter((c) => (FT.tiers[c] || 0) >= 3).sort((a, b) => FT.tiers[b] - FT.tiers[a]).slice(0, 4);
    if (!top.length) { box.hidden = true; return; }
    box.hidden = false;
    const html = `<div class="v6-sec-h"><h3>${V("Featured creators")}</h3><small>${V("veARCIA Gold and Diamond creators — their best coin right now")}</small></div>
      <div class="v7-feat-grid">${top.map((c) => { const l = best.get(c), t = FT.tiers[c]; return `<a class="v7-fc t${t}" href="#creator?a=${c}">
        <span class="v7-fc-av" style="${typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(c) : ""}"></span>
        <span class="v7-fc-t"><b data-no-i18n>${short(c)}</b><em class="v6-badge va t${t}" data-no-i18n>${TIER[t]}</em></span>
        <span class="v7-fc-c">${logoHtml(l, "v7-fc-logo")}<span><b data-no-i18n>$${esc(l.symbol)}</b><small data-no-i18n>${usd(l.marketCapUsd)}</small></span></span>
        <span class="v7-fc-go">${V("View profile")} →</span></a>`; }).join("")}</div>`;
    if (box.__h !== html) { box.innerHTML = html; box.__h = html; }
  }
  // the crown passes: when v6 crowns a new king, the old one slides out and the crown arcs over
  function crownWatch() {
    const box = $("v6-koth"); if (!box || box.__v7) return;
    if (crownWatch.prev === undefined) { const k = store.get("arcpad.koth.v1", null); crownWatch.prev = k && k.k ? k.k : null; }
    box.__v7 = true;
    new MutationObserver((ms) => {
      if (!box.classList.contains("v6-newking") || reduce) return;
      const old = ms.flatMap((m) => [...m.removedNodes]).find((n) => n.classList && n.classList.contains("v6-koth-in"));
      // the king before this visit (v6 keeps it in this browser) when there was no card on the page yet
      const was = !old && crownWatch.prev ? coins().find((l) => lc(l.token) === lc(crownWatch.prev)) : null;
      crownWatch.prev = null;
      if (!old && !was) return;
      const sym = old ? (old.querySelector(".v6-koth-t b") || {}).textContent || "" : `$${was.symbol}`;
      const tmp = document.createElement("div"); if (was) tmp.innerHTML = logoHtml(was, "v6-koth-logo");
      const logo = old ? old.querySelector(".v6-koth-logo") : tmp.firstElementChild;
      const g = document.createElement("div");
      g.className = "v7-dethroned";
      g.innerHTML = `${logo ? logo.outerHTML : ""}<span><b data-no-i18n>${esc(sym)}</b><small>${V("dethroned")}</small></span>`;
      box.appendChild(g);
      const crown = box.querySelector(".v6-crown");
      if (crown) {
        const fly = document.createElement("span");
        fly.className = "v7-crownfly"; fly.innerHTML = crown.innerHTML;
        const a = g.getBoundingClientRect(), b = crown.getBoundingClientRect(), o = box.getBoundingClientRect();
        fly.style.left = a.left - o.left + 18 + "px"; fly.style.top = a.top - o.top + "px";
        fly.style.setProperty("--dx", b.left - a.left - 18 + "px"); fly.style.setProperty("--dy", b.top - a.top + "px");
        box.appendChild(fly); setTimeout(() => fly.remove(), 1300);
      }
      setTimeout(() => g.remove(), 2600);
    }).observe(box, { childList: true });
  }

  // =====================================================================
  // Explore: freshness, sortable list, presets, FLIP, first-minute badge, compare tray
  // =====================================================================
  function paintFresh() {
    const bar = document.querySelector("#bp-panel-explore .cn-explore-toolbar"); if (!bar) return;
    let el = $("v7-fresh");
    if (!el) { el = document.createElement("span"); el.id = "v7-fresh"; el.className = "v7-fresh"; el.setAttribute("aria-live", "off"); bar.appendChild(el); }
    const f = ARC.fromServer, at = typeof ACT !== "undefined" && ACT.paintedAt ? ACT.paintedAt : ARC.launchesLoaded ? (ARC._loadedAt = ARC._loadedAt || Date.now()) : 0;
    let txt, cls;
    if (f) { const m = Math.max(0, Math.round((Date.now() - f.at) / 60e3)); txt = `${V("Server data")} · ${m} ${V("min ago")}`; cls = "stale"; }
    else if (!at) { el.hidden = true; return; }
    else { const s = Math.max(0, Math.round((Date.now() - at) / 1000)); txt = s < 60 ? `${V("Updated")} ${s}${V("s ago")}` : `${V("Updated")} ${Math.round(s / 60)} ${V("min ago")}`; cls = s < 45 ? "live" : "old"; }
    el.hidden = false;
    el.className = "v7-fresh " + cls;
    const html = `<i aria-hidden="true"></i><span data-no-i18n>${txt}</span>`;
    if (el.__h !== html) { el.innerHTML = html; el.__h = html; }
  }
  // list view: its header sorts (same keys as the chips), a second tap flips the order
  const COLS = ["name", null, "mcap", "vol", "trades", "gainers", "new"];
  function sortHeads() {
    const th = document.querySelector("#v6-table .v6-th"); if (!th || th.__v7) return;
    th.__v7 = true;
    [...th.children].forEach((sp, i) => {
      const k = COLS[i]; if (!k) return;
      sp.setAttribute("role", "button"); sp.tabIndex = 0; sp.dataset.v7sort = k; sp.classList.add("v7-th");
      const on = typeof arcExploreSort !== "undefined" && arcExploreSort === k;
      if (on) { sp.classList.add("on"); sp.setAttribute("aria-sort", window.arcExploreDir === -1 ? (k === "name" ? "descending" : "ascending") : (k === "name" ? "ascending" : "descending")); sp.insertAdjacentHTML("beforeend", `<i aria-hidden="true">${window.arcExploreDir === -1 ? "▲" : "▼"}</i>`); }
      else sp.setAttribute("aria-sort", "none");
    });
  }
  function sortBy(k) {
    // eslint-disable-next-line no-global-assign
    if (arcExploreSort === k) window.arcExploreDir = window.arcExploreDir === -1 ? 1 : -1; else { arcExploreSort = k; window.arcExploreDir = 1; }
    document.querySelectorAll("#ap-sort-group button").forEach((x) => x.classList.toggle("active", x.dataset.sort === k));
    renderArcpadExploreGrid();
  }
  document.addEventListener("click", (e) => { const h = e.target.closest && e.target.closest("[data-v7sort]"); if (h) sortBy(h.dataset.v7sort); });
  document.addEventListener("keydown", (e) => { const h = e.target.closest && e.target.closest("[data-v7sort]"); if (h && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); sortBy(h.dataset.v7sort); } });
  // the chips row resets the flip
  document.addEventListener("click", (e) => { if (e.target.closest && e.target.closest("#ap-sort-group button")) window.arcExploreDir = 1; }, true);

  // presets: the sort, the filters, the search and the view under a name (this browser)
  const PKEY = "arcpad.presets.v1";
  function viewNow() { return { sort: typeof arcExploreSort !== "undefined" ? arcExploreSort : "mcap", dir: window.arcExploreDir === -1 ? -1 : 1, f: typeof window.arcFiltersGet === "function" ? window.arcFiltersGet() : {}, q: ($("ap-explore-search") || {}).value || "", view: store.get("arcpad.exview.v1", "grid") }; }
  function applyView(v) {
    const s = $("ap-explore-search"); if (s) s.value = v.q || "";
    if (v.view) { store.set("arcpad.exview.v1", v.view); const b = document.querySelector(`[data-v6-view="${v.view}"]`); if (b) b.click(); }
    // eslint-disable-next-line no-global-assign
    arcExploreSort = v.sort || "mcap"; window.arcExploreDir = v.dir === -1 ? -1 : 1;
    document.querySelectorAll("#ap-sort-group button").forEach((x) => x.classList.toggle("active", x.dataset.sort === arcExploreSort));
    if (typeof window.arcFiltersSet === "function") window.arcFiltersSet(v.f || {}); else renderArcpadExploreGrid();
  }
  function paintPresets() {
    const bar = document.querySelector("#bp-panel-explore .cn-explore-toolbar"); if (!bar) return;
    let row = $("v7-presets");
    if (!row) { row = document.createElement("div"); row.id = "v7-presets"; row.className = "v7-presets"; const after = $("ap-filter-panel") || bar; after.after(row); }
    const list = store.get(PKEY, []);
    row.innerHTML = `<span class="v7-pre-l">${V("Presets")}</span>${list.map((p, i) => `<span class="v7-pre"><button type="button" data-v7pre="${i}">${esc(p.name)}</button><button type="button" class="x" data-v7pre-x="${i}" aria-label="${V("Remove preset")}: ${esc(p.name)}">×</button></span>`).join("")}
      <form class="v7-pre-new" id="v7-pre-new"><input id="v7-pre-name" maxlength="24" placeholder="${V("Name it")}" aria-label="${V("Name it")}" hidden><button type="button" class="v7-pre-add" id="v7-pre-add">+ ${V("Save this view")}</button><button type="submit" class="v7-pre-ok" hidden>${V("Save")}</button></form>`;
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest ? e.target : null; if (!t) return;
    const p = t.closest("[data-v7pre]"); if (p) { const v = store.get(PKEY, [])[Number(p.dataset.v7pre)]; if (v) applyView(v); return; }
    const x = t.closest("[data-v7pre-x]"); if (x) { const list = store.get(PKEY, []); list.splice(Number(x.dataset.v7preX), 1); store.set(PKEY, list); paintPresets(); return; }
    if (t.closest("#v7-pre-add")) { const i = $("v7-pre-name"); i.hidden = false; t.closest("#v7-pre-add").hidden = true; $("v7-pre-new").querySelector(".v7-pre-ok").hidden = false; i.focus(); }
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "v7-pre-new") return;
    e.preventDefault();
    const name = ($("v7-pre-name").value || "").trim().slice(0, 24); if (!name) { $("v7-pre-name").focus(); return; }
    const list = store.get(PKEY, []).filter((p) => p.name !== name);
    list.unshift({ name, ...viewNow() }); store.set(PKEY, list.slice(0, 6)); paintPresets();
  });
  // FLIP: cards that move slide from where they were, new ones push in
  function flipWrap() {
    if (typeof renderArcpadExploreGrid !== "function" || renderArcpadExploreGrid.__v7) return;
    const orig = renderArcpadExploreGrid;
    const wrapped = function () {
      const grid = $("ap-explore-grid");
      const live = !reduce && grid && activeTab() === "explore" && !grid.classList.contains("v6-list");
      const before = new Map();
      if (live) grid.querySelectorAll(".ap-launch-card[data-token]").forEach((c, i) => { if (i < 60) before.set(c.dataset.token, c.getBoundingClientRect()); });
      orig.apply(this, arguments);
      afterGrid();
      if (!live || !before.size) return;
      grid.querySelectorAll(".ap-launch-card[data-token]").forEach((c, i) => {
        if (i >= 60) return;
        const was = before.get(c.dataset.token), now = c.getBoundingClientRect();
        if (!was) { c.classList.add("v7-push"); return; }
        const dx = was.left - now.left, dy = was.top - now.top;
        if (!dx && !dy) return;
        c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" });
      });
    };
    wrapped.__v7 = true;
    // eslint-disable-next-line no-global-assign
    renderArcpadExploreGrid = wrapped;
  }
  // first-minute badge: the server's read of each coin's first 60 seconds (api/_aplist.mjs), or the coin page's own
  const EARLY = new Map();
  window.arcEarlyMap = EARLY;
  function loadEarly() {
    if (typeof arcpadSnapshot !== "function") return;
    arcpadSnapshot().then((j) => { if (!j) return; for (const l of j.launches) if (l.early) EARLY.set(lc(l.token), l.early); badges(); }).catch(() => {});
    for (const [k, v] of Object.entries(store.get("arcpad.early.v1", {}))) if (!EARLY.has(k)) EARLY.set(k, v);
  }
  function badges(root) {
    (root || document).querySelectorAll(".ap-launch-card[data-token]").forEach((c) => {
      const e = EARLY.get(lc(c.dataset.token)), has = c.querySelector(".v7-snipe");
      if (!e || !(e.pct >= 10)) { if (has) has.remove(); return; }
      if (has) return;
      // on the name line, so it never pushes the card's top row onto two lines
      const top = c.querySelector(".name") || c.querySelector(".ap-card-top"); if (!top) return;
      top.insertAdjacentHTML("beforeend", `<span class="v7-snipe v7-snipe-n ${e.pct >= 25 ? "bad" : "warn"}" title="${esc(e.pct.toFixed(1))}% ${V("of the supply bought in the first minute")}" data-no-i18n>⚡ ${Math.round(e.pct)}%</span>`);
    });
  }
  // compare: up to 3 coins (Arc coins: ArcPad and Argus), a tray, then #compare?t=a,b,c
  const CMP = { list: store.get("arcpad.compare.v1", []).filter(isAddr).slice(0, 3) };
  window.arcCompare = CMP;
  function cmpToggle(t) {
    t = lc(t); const i = CMP.list.indexOf(t);
    if (i >= 0) CMP.list.splice(i, 1); else { if (CMP.list.length >= 3) CMP.list.shift(); CMP.list.push(t); }
    store.set("arcpad.compare.v1", CMP.list); paintCmp();
  }
  window.arcCompareToggle = cmpToggle;
  function paintCmp() {
    document.querySelectorAll(".ap-launch-card[data-token]").forEach((c) => {
      if (c.dataset.platform === "pons" || c.dataset.platform === "pump") return;
      let b = c.querySelector(".v7-cmpb");
      if (!b) { b = document.createElement("span"); b.className = "v7-cmpb"; b.setAttribute("role", "button"); b.tabIndex = 0; b.dataset.v7cmp = c.dataset.token; b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M17 4v16M3 8h8M13 16h8"/></svg>'; c.appendChild(b); }
      const on = CMP.list.includes(lc(c.dataset.token));
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); b.setAttribute("aria-label", tr(on ? "Remove from compare" : "Add to compare")); b.title = b.getAttribute("aria-label");
    });
    let tray = $("v7-tray");
    if (!CMP.list.length || activeTab() === "compare") { if (tray) tray.hidden = true; return; }
    if (!tray) { tray = document.createElement("div"); tray.id = "v7-tray"; tray.className = "v7-tray"; tray.setAttribute("role", "region"); tray.setAttribute("aria-label", "Compare"); document.body.appendChild(tray); }
    tray.hidden = false;
    const all = coins();
    tray.innerHTML = `<span class="v7-tray-l">${V("Compare")}</span>${CMP.list.map((t) => { const l = all.find((x) => lc(x.token) === t) || { token: t, symbol: short(t) }; return `<span class="v7-tray-c">${logoHtml(l, "v7-tray-logo")}<b data-no-i18n>$${esc(l.symbol)}</b><button type="button" data-v7cmp="${t}" aria-label="${V("Remove from compare")}">×</button></span>`; }).join("")}
      <a class="v7-tray-go${CMP.list.length < 2 ? " off" : ""}" href="#compare?t=${CMP.list.join(",")}" ${CMP.list.length < 2 ? 'aria-disabled="true"' : ""}>${V("Compare now")} →</a><button type="button" class="v7-tray-x" data-v7cmp-clear>${V("Clear")}</button>`;
  }
  window.arcPaintCompare = paintCmp;
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-v7cmp]");
    if (b) { e.preventDefault(); e.stopPropagation(); cmpToggle(b.dataset.v7cmp); return; }
    if (e.target.closest && e.target.closest("[data-v7cmp-clear]")) { CMP.list = []; store.set("arcpad.compare.v1", []); paintCmp(); }
    const go = e.target.closest && e.target.closest(".v7-tray-go.off"); if (go) e.preventDefault();
  }, true);
  function afterGrid() { badges(); paintCmp(); }

  // =====================================================================
  // Launch: two columns, per-step checks, fee value, platform cards, platform colour
  // =====================================================================
  const PLAT = {
    arcpad: { chain: "Arc", c: "#39ff88" }, argus: { chain: "Arc", c: "#8f9bff" },
    pons: { chain: "Robinhood Chain", c: "#ffb547" }, pump: { chain: "Solana", c: "#2de0c3" },
  };
  const platNow = () => { const b = document.querySelector('#agl-plat [aria-checked="true"]'); return b ? b.dataset.plat : "arcpad"; };
  function launchCols() {
    const panel = $("bp-panel-launch"), form = $("ap-launch-form"), nav = $("v6-stepnav");
    if (!panel || !form || $("v7-lgrid") || !document.querySelector(".v6-step")) return;
    const grid = document.createElement("div"); grid.id = "v7-lgrid"; grid.className = "v7-lgrid";
    const left = document.createElement("div"); left.className = "v7-lmain";
    const side = document.createElement("aside"); side.className = "v7-lside"; side.id = "v7-lside"; side.setAttribute("aria-label", "Summary");
    form.before(grid); grid.append(left, side); left.appendChild(form); if (nav) left.appendChild(nav);
    // the preview card moves to the summary column (same element: the launch scripts paint it by id)
    const pv = $("ap-launch-preview");
    side.innerHTML = `<div class="v7-ls-card"><div class="v7-ls-pv"></div><div id="v7-check" class="v7-check"></div><div id="v7-cost" class="v7-cost"></div></div>`;
    if (pv) side.querySelector(".v7-ls-pv").appendChild(pv);
    // fee slider: its value next to the label, ticks under it
    const fee = $("ap-extrafee");
    if (fee && !$("v7-feeval")) {
      const lab = fee.closest("label"), span = lab && lab.querySelector("span");
      if (span) span.insertAdjacentHTML("afterend", ` <output id="v7-feeval" for="ap-extrafee" class="v7-feeval" data-no-i18n>0%</output>`);
      fee.insertAdjacentHTML("afterend", `<div class="v7-ticks" aria-hidden="true" data-no-i18n><span>0%</span><span>0.5%</span><span>1%</span><span>1.5%</span><span>2%</span></div>`);
    }
    // platform cards: the chain under each, and the comparison table
    const pl = $("agl-plat");
    if (pl && !pl.__v7) {
      pl.__v7 = true;
      pl.querySelectorAll("[data-plat]").forEach((b) => { const p = PLAT[b.dataset.plat]; if (p) { b.style.setProperty("--pc", p.c); b.insertAdjacentHTML("afterbegin", `<span class="v7-chain" data-no-i18n><i aria-hidden="true"></i>${esc(p.chain)}</span>`); } });
      pl.insertAdjacentHTML("afterend", `<details class="v7-ptab"><summary>${V("Compare platforms")}</summary><div class="v7-ptab-w"><table>
        <thead><tr><th></th><th data-no-i18n>ArcPad</th><th data-no-i18n>Argus</th><th data-no-i18n>Pons</th><th data-no-i18n>Pump.fun</th></tr></thead><tbody>
        <tr><th>${V("Chain")}</th><td data-no-i18n>Arc</td><td data-no-i18n>Arc</td><td data-no-i18n>Robinhood Chain</td><td data-no-i18n>Solana</td></tr>
        <tr><th>${V("Trades on")}</th><td>${T("Uniswap v4 pool from block one")}</td><td>${T("Uniswap v4 pool with buy / sell tax")}</td><td>${T("Bonding curve, then Uniswap v4")}</td><td>${T("Bonding curve, then PumpSwap")}</td></tr>
        <tr><th>${V("To launch")}</th><td data-no-i18n>1 USDC</td><td>${T("An opening buy in USDC")}</td><td>${T("Pons's fee in ETH")}</td><td>${T("About 0.03 SOL in accounts")}</td></tr>
        <tr><th>${V("Creator fees")}</th><td>${T("70% of the 1% base fee, plus your add-on")}</td><td>${T("70% of the creator share")}</td><td>${T("70% of creator fees")}</td><td>${T("70% of creator fees")}</td></tr>
        <tr><th>${V("Graduates")}</th><td>—</td><td>—</td><td>${T("When the curve fills")}</td><td>${T("When the curve fills")}</td></tr>
        <tr><th>${V("Wallet")}</th><td>${T("Your Arc wallet")}</td><td>${T("Your Arc wallet")}</td><td>${T("Your EVM wallet")}</td><td>${T("A Solana wallet")}</td></tr>
        </tbody></table></div></details>`);
    }
    panel.dataset.plat = platNow();
    paintCost();
  }
  const num = (id) => { const el = $(id); const v = el ? Number(String(el.value || "").replace(/,/g, "")) : 0; return isFinite(v) && v > 0 ? v : 0; };
  function paintCost() {
    const box = $("v7-cost"); if (!box) return;
    const p = platNow(), rows = [];
    const fmt = (v, u) => `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 4 })} ${u}`;
    if (p === "arcpad") {
      const dev = num("ap-devbuy"), fee = Number(($("ap-extrafee") || {}).value || 0) / 100, unit = ($("ap-devbuy-unit") || {}).textContent || "USDC";
      rows.push([V("Launch fee"), "1 USDC"]);
      rows.push([V("Dev buy"), dev ? fmt(dev, unit) : "—"]);
      rows.push([V("Your add-on fee"), `${fee.toFixed(fee % 1 ? 1 : 0)}% <small>${V("of every trade, 100% yours")}</small>`]);
      rows.push([V("Total"), `<b>${unit === "USDC" ? fmt(1 + dev, "USDC") : `1 USDC${dev ? " + " + fmt(dev, unit) : ""}`}</b> <small>${V("plus a little gas")}</small>`, "tot"]);
    } else if (p === "argus") {
      const seed = num("agl-seed");
      rows.push([V("Opening buy"), seed ? fmt(seed, "USDC") : V("Minimum")]);
      rows.push([V("Buy / sell tax"), `${esc(($("agl-buy") || {}).value || "0")}% / ${esc(($("agl-sell") || {}).value || "0")}%`]);
      rows.push([V("Signatures"), "2"]);
    } else if (p === "pons") {
      rows.push([V("Pons launch fee"), `<small>${V("in ETH, read when you launch")}</small>`]);
      rows.push([V("Creator tax"), `${esc(($("pon-tax") || {}).value || "0")}%`]);
    } else if (p === "pump") {
      const dev = num("pmp-devbuy");
      rows.push([V("Accounts & fees"), V("about 0.03 SOL")]);
      rows.push([V("Dev buy"), dev ? fmt(dev, "SOL") : "—"]);
      rows.push([V("Total"), `<b>≈ ${fmt(0.03 + dev, "SOL")}</b>`, "tot"]);
    }
    const html = `<h4>${V("What it costs")}</h4><dl>${rows.map(([k, v, c]) => `<div class="${c || ""}"><dt>${k}</dt><dd data-no-i18n>${v}</dd></div>`).join("")}</dl>`;
    if (box.__h !== html) { box.innerHTML = html; box.__h = html; }
    // the checklist
    const ck = $("v7-check");
    if (ck) {
      const n = ($("ap-name") || {}).value || "", s = ($("ap-symbol") || {}).value || "", lg = ($("ap-logo") || {}).value || "";
      const item = (ok, label, opt) => `<li class="${ok ? "ok" : opt ? "opt" : ""}"><i aria-hidden="true"></i>${V(label)}${opt && !ok ? ` <small>${V("optional")}</small>` : ""}</li>`;
      const h2 = `<h4>${V("Checklist")}</h4><ul>${item(n.trim().length > 0, "Name")}${item(/^[A-Za-z0-9]{1,10}$/.test(s.trim()), "Ticker")}${item(!!lg.trim(), "Logo", true)}</ul>`;
      if (ck.__h !== h2) { ck.innerHTML = h2; ck.__h = h2; }
    }
    const fv = $("v7-feeval"); if (fv) { const v = Number(($("ap-extrafee") || {}).value || 0) / 100; fv.textContent = `+${v.toFixed(v % 1 ? 1 : 0)}%`; fv.classList.toggle("zero", v === 0); }
  }
  // per-step checks: what's wrong is said under the field
  const URLRE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
  function mark(id, msg) {
    const el = $(id); if (!el) return;
    el.setAttribute("aria-invalid", "true");
    const host = el.closest("label") || el;
    let m = host.parentNode.querySelector(`.v7-err[data-for="${id}"]`);
    if (!m) { m = document.createElement("small"); m.className = "v7-err"; m.dataset.for = id; m.setAttribute("role", "alert"); host.after(m); }
    m.textContent = tr((L[lang()] && L[lang()][msg]) || msg);
    el.setAttribute("aria-describedby", (m.id = "v7e-" + id));
  }
  function unmark(id) { const el = $(id); if (!el) return; el.removeAttribute("aria-invalid"); const m = document.querySelector(`.v7-err[data-for="${id}"]`); if (m) m.remove(); }
  function stepCheck(k) {
    const bad = [];
    const p = platNow();
    if (k === "basics") {
      const n = ($("ap-name") || {}).value || "", s = ($("ap-symbol") || {}).value || "", lg = (($("ap-logo") || {}).value || "").trim();
      if (!n.trim()) bad.push(["ap-name", "Give it a name."]);
      if (!s.trim()) bad.push(["ap-symbol", "Give it a ticker."]); else if (!/^[A-Za-z0-9]{1,10}$/.test(s.trim())) bad.push(["ap-symbol", "Letters and numbers only, up to 10."]);
      if (lg && !/^https?:\/\//i.test(lg) && !/^data:image\//i.test(lg)) bad.push(["ap-logo", "That isn't an image link (https://… or an upload)."]);
      const u = (id) => (($(id) || {}).value || "").trim();
      if (u("ap-website") && !URLRE.test(u("ap-website"))) bad.push(["ap-website", "That isn't a link (https://…)."]);
      if (u("ap-twitter") && !/^https?:\/\/(www\.)?(x|twitter)\.com\/\S+/i.test(u("ap-twitter"))) bad.push(["ap-twitter", "That's not an X link (x.com/…)."]);
      if (u("ap-telegram") && !/^https?:\/\/(t\.me|telegram\.me)\/\S+/i.test(u("ap-telegram"))) bad.push(["ap-telegram", "That's not a Telegram link (t.me/…)."]);
      if (p === "arcpad" && u("ap-discord") && !/^https?:\/\/(www\.)?(discord\.gg|discord\.com)\/\S+/i.test(u("ap-discord"))) bad.push(["ap-discord", "That's not a Discord link."]);
      ["ap-name", "ap-symbol", "ap-logo", "ap-website", "ap-twitter", "ap-telegram", "ap-discord"].forEach(unmark);
    }
    if (k === "token") {
      ["ap-devbuy", "ap-pair-ca"].forEach(unmark);
      if (p === "arcpad") {
        const d = (($("ap-devbuy") || {}).value || "").trim();
        if (d && !(Number(d) >= 0)) bad.push(["ap-devbuy", "Dev buy must be a number."]);
        const custom = document.querySelector('#ap-pair-seg [data-pair="custom"].active');
        if (custom && !isAddr((($("ap-pair-ca") || {}).value || "").trim())) bad.push(["ap-pair-ca", "Paste the pair token's address (0x…)."]);
      }
    }
    for (const [id, m] of bad) mark(id, m);
    if (bad.length) { const f = $(bad[0][0]); if (f) { f.focus(); if (!reduce) { f.classList.remove("v7-shake"); void f.offsetWidth; f.classList.add("v7-shake"); } } }
    return !bad.length;
  }
  // the launch button checks every step first (and opens the one that needs fixing)
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "ap-launch-form" || !window.arcV6) return;
    const S = window.arcV6.STEPS || [];
    for (let i = 0; i < S.length; i++) if (!stepCheck(S[i][0])) { e.preventDefault(); e.stopImmediatePropagation(); window.arcV6.setStep(i); stepCheck(S[i][0]); if (typeof window.arcToast === "function") window.arcToast(tr((L[lang()] || {})["Fix this step first"] || "Fix this step first"), "bad"); return; }
  }, true);
  document.addEventListener("input", (e) => {
    const id = e.target && e.target.id;
    if (id && e.target.getAttribute("aria-invalid") === "true") unmark(id);
    if (e.target.closest && e.target.closest("#bp-panel-launch")) paintCost();
  });
  // platform switch: the page takes the platform's colour, with a sweep
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("#agl-plat [data-plat]"); if (!b) return;
    setTimeout(() => {
      const panel = $("bp-panel-launch"), p = platNow(); if (!panel || panel.dataset.plat === p) { paintCost(); return; }
      panel.dataset.plat = p; paintCost();
      if (reduce) return;
      const sw = document.createElement("div"); sw.className = "v7-sweep"; sw.style.setProperty("--pc", (PLAT[p] || PLAT.arcpad).c);
      panel.appendChild(sw); setTimeout(() => sw.remove(), 900);
    }, 0);
  });

  // =====================================================================
  // Scheduled launches: the last 10 seconds, then the coin's logo as confetti
  // =====================================================================
  function planTick() {
    const now = Date.now() / 1000;
    document.querySelectorAll(".v6-plan[data-plan]").forEach((card) => {
      const cd = card.querySelector("[data-cd]"); if (!cd) { const big = card.querySelector(".v7-cd10"); if (big && !card.__boom) boom(card); return; }
      const left = Number(cd.dataset.cd) - now;
      let big = card.querySelector(".v7-cd10");
      if (left > 10.5 || left < -2) { if (big) big.remove(); return; }
      if (!big) { big = document.createElement("div"); big.className = "v7-cd10"; big.setAttribute("aria-live", "assertive"); card.appendChild(big); }
      const n = Math.max(0, Math.ceil(left));
      if (big.dataset.n !== String(n)) { big.dataset.n = String(n); big.innerHTML = n > 0 ? `<b data-no-i18n>${n}</b>` : `<b>${V("Launching!")}</b>`; if (!reduce) { big.classList.remove("pop"); void big.offsetWidth; big.classList.add("pop"); } }
      if (n === 0 && !card.__boom) boom(card);
    });
  }
  function boom(card) {
    card.__boom = true;
    if (reduce) return;
    const logo = card.querySelector(".v6-plan-logo"); const r = card.getBoundingClientRect();
    const layer = document.createElement("div"); layer.className = "v7-confetti"; layer.style.left = r.left + r.width / 2 + "px"; layer.style.top = r.top + r.height / 2 + "px";
    for (let i = 0; i < 26; i++) {
      const a = (Math.PI * 2 * i) / 26 + Math.random() * 0.3, d = 90 + Math.random() * 140;
      const el = logo ? logo.cloneNode(true) : document.createElement("i");
      el.className = "v7-cf" + (logo && logo.tagName === "IMG" ? " img" : " ph");
      el.style.setProperty("--x", Math.cos(a) * d + "px"); el.style.setProperty("--y", Math.sin(a) * d - 60 + "px"); el.style.setProperty("--r", (Math.random() * 720 - 360) + "deg"); el.style.animationDelay = Math.random() * 120 + "ms";
      layer.appendChild(el);
    }
    document.body.appendChild(layer); setTimeout(() => layer.remove(), 1800);
    if (typeof window.arcConfetti === "function") window.arcConfetti({ count: 60 });
  }

  // =====================================================================
  // Motion: skeleton → data, long-press quick buy
  // =====================================================================
  function xfadeWatch(id) {
    const el = $(id); if (!el || el.__v7) return;
    el.__v7 = true;
    new MutationObserver((ms) => {
      const gone = ms.some((m) => [...m.removedNodes].some((n) => n.classList && n.classList.contains("ap-skel-card")));
      if (!gone || reduce) return;
      el.querySelectorAll(".ap-launch-card").forEach((c, i) => { c.style.setProperty("--i", Math.min(i, 12)); c.classList.add("v7-xfade"); });
    }).observe(el, { childList: true });
  }
  // long-press a coin card on a touch screen: a quick-buy sheet (ArcPad coins paired with USDC)
  let lp = null;
  function lpSheet(card) {
    const tok = card.dataset.token, l = (ARC.launches || []).find((x) => lc(x.token) === lc(tok));
    if (!l) return;
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch { /* not allowed */ } }
    let sh = $("v7-lp");
    if (!sh) { sh = document.createElement("div"); sh.id = "v7-lp"; sh.className = "v7-lp"; document.body.appendChild(sh); sh.addEventListener("click", (e) => { if (e.target === sh || e.target.closest("[data-lp-x]")) sh.hidden = true; const b = e.target.closest("[data-lp-buy]"); if (b && window.arcV6) window.arcV6.quickBuy(sh.dataset.t, Number(b.dataset.lpBuy), b); const o = e.target.closest("[data-lp-open]"); if (o) { sh.hidden = true; if (typeof openArcCoin === "function") openArcCoin(sh.dataset.t); } const cm = e.target.closest("[data-lp-cmp]"); if (cm) { sh.hidden = true; cmpToggle(sh.dataset.t); } }); }
    sh.dataset.t = l.token; sh.hidden = false;
    const qb = l.quoteIsUsdc;
    sh.innerHTML = `<div class="v7-lp-box" role="dialog" aria-modal="true" aria-label="${V("Quick buy")} $${esc(l.symbol)}"><span class="v7-lp-grab" aria-hidden="true"></span>
      <div class="v7-lp-h">${logoHtml(l, "v7-lp-logo")}<span><b data-no-i18n>$${esc(l.symbol)}</b><small data-no-i18n>${esc(l.name)} · ${usd(l.marketCapUsd)}</small></span><button type="button" class="v7-lp-x" data-lp-x aria-label="Close">×</button></div>
      ${qb ? `<p>${V("Quick buy")}</p><div class="v7-lp-amts">${[1, 5, 10, 25].map((v) => `<button type="button" class="v6-qbb" data-lp-buy="${v}" data-no-i18n>$${v}</button>`).join("")}</div>` : ""}
      <div class="v7-lp-row"><button type="button" class="bp-btn-ghost v7-lp-open" data-lp-open>${V("Open coin")} →</button><button type="button" class="bp-btn-ghost v7-lp-cmp${CMP.list.includes(lc(l.token)) ? " on" : ""}" data-lp-cmp>${V(CMP.list.includes(lc(l.token)) ? "Remove from compare" : "Add to compare")}</button></div></div>`;
    if (!reduce) { sh.classList.remove("in"); void sh.offsetWidth; sh.classList.add("in"); }
  }
  document.addEventListener("touchstart", (e) => {
    const c = e.target.closest && e.target.closest(".ap-launch-card[data-token]:not([data-platform])");
    if (!c || e.touches.length > 1) return;
    const t0 = e.touches[0];
    lp = { c, x: t0.clientX, y: t0.clientY, fired: false, t: setTimeout(() => { if (lp && lp.c === c) { lp.fired = true; c.classList.add("v7-pressed"); setTimeout(() => c.classList.remove("v7-pressed"), 250); lpSheet(c); } }, 480) };
  }, { passive: true });
  document.addEventListener("touchmove", (e) => { if (!lp) return; const t0 = e.touches[0]; if (Math.hypot(t0.clientX - lp.x, t0.clientY - lp.y) > 10) { clearTimeout(lp.t); lp = null; } }, { passive: true });
  document.addEventListener("touchend", () => { if (lp) clearTimeout(lp.t); if (lp && lp.fired) { const c = lp.c; c.__lpBlock = Date.now(); } lp = null; }, { passive: true });
  document.addEventListener("click", (e) => { const c = e.target.closest && e.target.closest(".ap-launch-card"); if (c && c.__lpBlock && Date.now() - c.__lpBlock < 700) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener("contextmenu", (e) => { if (e.target.closest && e.target.closest(".ap-launch-card") && matchMedia("(pointer: coarse)").matches) e.preventDefault(); });

  // =====================================================================
  // wiring
  // =====================================================================
  function onTab(t) {
    paintGroups(t);
    if (t === "home") { paintStats(); paintFeatured(); crownWatch(); }
    if (t === "explore") { paintFresh(); paintPresets(); afterGrid(); }
    if (t === "launch") setTimeout(() => { launchCols(); paintCost(); }, 0);
    paintCmp();
    setTimeout(bottomRoom, 300);
  }
  document.addEventListener("arcpad:tab", (e) => onTab(e.detail && e.detail.tab));
  document.addEventListener("arcpad:launchframe", () => setTimeout(launchCols, 0));
  document.addEventListener("arc:activity", () => { const t = activeTab(); if (t === "home") { paintStats(); paintFeatured(); } if (t === "explore") { paintFresh(); afterGrid(); } });
  // the explore list re-renders itself (v6): give its header the sort buttons again
  const ex = $("bp-panel-explore");
  if (ex) new MutationObserver(() => { sortHeads(); }).observe(ex, { childList: true, subtree: false });
  const grid = $("ap-explore-grid");
  if (grid) new MutationObserver(() => { clearTimeout(grid.__v7t); grid.__v7t = setTimeout(() => { sortHeads(); afterGrid(); }, 30); }).observe(grid, { childList: true });
  const track = $("ap-home-track");
  if (track) new MutationObserver(() => { clearTimeout(track.__v7t); track.__v7t = setTimeout(() => badges(track), 30); }).observe(track, { childList: true });
  xfadeWatch("ap-home-track"); xfadeWatch("ap-explore-grid");
  flipWrap(); newBadges(); paintGroups(activeTab()); loadEarly(); crownWatch();
  setInterval(() => { if (document.hidden) return; const t = activeTab(); if (t === "explore") paintFresh(); if (t === "home") planTick(); }, 1000);
  setInterval(() => { if (!document.hidden && activeTab() === "home") { paintStats(); paintFeatured(); } }, 15000);
  addEventListener("resize", () => { clearTimeout(bottomRoom.t); bottomRoom.t = setTimeout(bottomRoom, 200); });
  setTimeout(bottomRoom, 1200); setTimeout(bottomRoom, 4000);
  if (activeTab()) onTab(activeTab());
  window.arcV7 = { stepCheck, paintCost, paintStats, paintFeatured, badges, sortBy, viewNow, applyView, early: EARLY, store, V, L, spark, logoHtml, usd, short, esc, lc, isAddr, reduce, coins, statsOf, TIER, loadTiers, tiers: FT.tiers };
})();
