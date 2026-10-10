// wallet-plus.js — ARCIRCLE Wallet v2 on /wallet (wallet.html; the page's own script hands its helpers over as
// window.arcWalletPage). "One wallet. Multiple chains. Powered by AI."
//   · Tell your wallet: a typed command — "send 5 USDC to 0x…", "swap 100 USDC to ARCIRCLE", "buy AFROG with 1000
//     ARCIRCLE", "sell half my AFROG", "DCA $300 into ARCIRCLE over 7 days", "take profit on AFROG at +25%", "stop loss
//     AFROG at -10%", "buy the dip on AFROG with $100" — in English or Korean. The wallet reads it itself
//     (parse(), offline); what it can't read goes to ARCIA (POST /api/arcia {action:"intent"}) and comes back as
//     JSON that is checked field by field. Every command becomes a card the user confirms: transfers are signed here,
//     swaps open ARCIRCLE Swap filled in, strategies open ARCIRCLE Orders with the order line filled in. Nothing moves
//     without the user's own confirmation and signature.
//   · every ArcPad coin the wallet holds (one batched read of their balances on Arc), counted in the total, and the
//     balance split by chain
//   · Today's report: the wallet's value against the last report, what moved it, its swaps through ARCIRCLE Swap in
//     the last day and the $ARCIRCLE they burned, referral points, and ARCIA's few lines on it (POST /api/arcia
//     {action:"wreport"}); one snapshot a day is kept in this browser for the 30-day line
//   · Automate: DCA, take profit, stop loss, buy the dip and limit orders through ARCIRCLE Orders (signed orders
//     that the executor fills; tokens stay in the wallet until a fill)
//   · Invite friends: the wallet's invite link and its points (100 a wallet that joins and trades, 1 a dollar they
//     trade on ArcPad and ARCIRCLE Swap) — what points turn into is announced later
(function () {
  "use strict";
  const P = () => window.arcWalletPage;
  const $ = (id) => document.getElementById(id);
  const lc = (a) => String(a || "").toLowerCase();
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const USDC_ERC20 = "0x3600000000000000000000000000000000000000";
  const SWAP = () => lc((typeof CONFIG !== "undefined" && CONFIG.SWAP_ADDRESS) || "0x305Da1b305249072b13B73ab394E02046c865d56");
  const SWAP_FROM = () => Number((typeof CONFIG !== "undefined" && CONFIG.SWAP_FROM_BLOCK) || 25150057);
  const TOPIC_SWAPPED = "0x6886cf53e77d3f9cb0cdb0b601eb810af105466e2b75170449730419d6218f3a";
  const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
  const X = { launches: [], held: {}, heldAt: 0, heldFor: "", card: null, busy: false, report: null, refs: null, refsFor: "", swaps: null, swapsFor: "", auto: null, msg: null };
  const ICON = {
    spark: '<path d="M12 3l1.8 4.9L19 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', send: '<path d="M12 20V7M6 13l6-6 6 6M5 4h14"/>', swap: '<path d="M7 4v14M7 18l-3-3M7 18l3-3M17 20V6M17 6l-3 3M17 6l3 3"/>',
    clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.5V12l3.2 2"/>', up: '<path d="M4 17l5-5 4 4 7-8"/><path d="M15 8h5v5"/>', down: '<path d="M4 7l5 5 4-4 7 8"/><path d="M15 16h5v-5"/>',
    dip: '<path d="M3 6l6 8 4-4 8 10"/><path d="M8 20h12"/>', target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
    gift: '<rect x="4" y="10" width="16" height="10" rx="1"/><path d="M4 10h16M12 10v10"/><path d="M12 10c-1.2-3.6-6.4-4-6.4-1.3S9 10 12 10ZM12 10c1.2-3.6 6.4-4 6.4-1.3S15 10 12 10Z"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>', flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.4 1.2-3.6 2.2-4.7.3 1.6 1.1 2.6 2.1 2.9C10.9 8.6 11 5.6 12 3z"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lang = () => (P() ? P().lang() : "en");
  const T3 = (en, ko, zh) => (lang() === "ko" ? ko : lang() === "zh" ? zh : en);

  // ---------------- tokens the wallet knows ----------------
  /// { k, sym, name, ch, token (null = the chain's gas coin), dec, img, px }
  function directory() {
    const p = P(), out = [];
    for (const c of p.COINS) out.push({ k: c.k, sym: c.sym.replace(/^\$/, ""), name: c.sub || "", ch: c.ch, token: c.token || null, dec: 18, img: c.img || "", px: p.S.px[c.k] ?? null, base: true });
    for (const l of X.launches) {
      const t = lc(l.token);
      if (!isAddr(t) || out.some((x) => x.token === t)) continue;
      out.push({ k: t, sym: String(l.symbol || "").replace(/^\$/, "").slice(0, 16), name: l.name || "", ch: "arc", token: t, dec: 18, img: /^https:\/\//i.test(l.imageUrl || "") ? l.imageUrl : "", px: l.priceUsdc > 0 ? l.priceUsdc : null });
    }
    return out;
  }
  /// a word → a token: a symbol (with or without $, any case), a name, or a 0x contract address
  function resolve(w) {
    if (!w) return null;
    const s = lc(String(w).trim().replace(/^\$/, "").replace(/[.,!?]+$/, ""));
    const d = directory();
    if (isAddr(s)) return d.find((x) => x.token === s) || { k: s, sym: s.slice(0, 6) + "…" + s.slice(-4), name: "", ch: "arc", token: s, dec: null, img: "", px: null, unknown: true };
    const alias = { usd: "usdc", "달러": "usdc", "유에스디씨": "usdc", "아크서클": "arcircle", "아르시아": "arcia", "이더": "eth", "이더리움": "eth", ether: "eth", ethereum: "eth" };
    const q = alias[s] || s;
    return d.find((x) => lc(x.sym) === q) || d.find((x) => lc(x.name) === q) || null;
  }
  const tokenAddrOnArc = (t) => (!t ? null : t.k === "usdc" ? USDC_ERC20 : t.ch === "arc" ? t.token : null);

  // ---------------- reading a command ----------------
  const NUMRE = /(\$)?\s*(\d[\d,]*\.?\d*|\.\d+)\s*(k|m|b|천|만)?(?![\w.])/i;
  const mult = (u) => ({ k: 1e3, m: 1e6, b: 1e9, "천": 1e3, "만": 1e4 }[lc(u || "")] || 1);
  /// every number in the line with its position: { v, usd, pct, i, end }
  function numbers(s) {
    const out = [], re = /(\$)?\s*(\d[\d,]*\.?\d*|\.\d+)\s*(k|m|b|천|만)?\s*(%|달러|불|dollars?)?(?![\w.])/gi;
    let m;
    while ((m = re.exec(s))) {
      const v = Number(m[2].replace(/,/g, "")) * mult(m[3]);
      if (!isFinite(v) || v <= 0) continue;
      // a number inside a 0x address isn't an amount
      const before = s.slice(Math.max(0, m.index - 42), m.index + 1);
      if (/0x[0-9a-f]*$/i.test(before.trim()) && !m[1]) continue;
      // "7 days" / "7일" / "x4" are a duration or a count, not an amount
      if (!m[1] && !m[4] && /^\s*(days?|hours?|weeks?|일|시간|주|[dhw](?![a-z])|x\d)/i.test(s.slice(m.index + m[0].length))) continue;
      if (!m[1] && !m[4] && /x\s*$/i.test(s.slice(Math.max(0, m.index - 2), m.index))) continue;
      out.push({ at: /(?:\bat|@)\s*(?:mcap |mc |market cap )?$/i.test(s.slice(0, m.index)), v, usd: !!m[1] || /달러|불|dollar/i.test(m[4] || ""), pct: m[4] === "%", sign: /[+-−]\s*$/.test(s.slice(Math.max(0, m.index - 2), m.index)) ? (/[-−]\s*$/.test(s.slice(Math.max(0, m.index - 2), m.index)) ? -1 : 1) : 0, i: m.index, end: m.index + m[0].length });
    }
    return out;
  }
  /// every token named in the line, in order: { t, i, w }
  function tokensIn(raw) {
    const out = [];
    const re = /0x[0-9a-fA-F]{40}|\$?[A-Za-z][A-Za-z0-9]{1,15}|[가-힣]{2,6}/g;
    let m;
    while ((m = re.exec(raw))) {
      let w = m[0];
      // Korean particles stuck to a Korean name: 아크서클로 / 이더를 / 달러에서
      let t = resolve(w);
      const ko = !t && /^([가-힣]{2,}?)(으로부터|으로|로|를|을|이|가|에게|한테|에서|어치)$/.exec(w);
      if (ko) { const t2 = resolve(ko[1]); if (t2) { t = t2; w = ko[1]; } }
      // "ARCIRCLE로" / "아크서클로": what it becomes
      const ro = /^(으로|로)(?!부터)/.test(raw.slice(m.index + m[0].length)) || (ko && /^(으로|로)$/.test(ko[2]));
      if (t && !STOP.has(lc(w))) out.push({ t, i: m.index, w, ro: !!ro });
    }
    // "AFROG를" — a Latin symbol followed by a Korean particle is caught as two pieces; that's fine
    return out;
  }
  const STOP = new Set(["to", "for", "with", "of", "my", "all", "the", "and", "send", "swap", "buy", "sell", "into", "on", "at", "over", "dca", "stop", "loss", "take", "profit", "dip", "half", "max", "daily", "day", "days", "week", "weeks", "hour", "hours", "every", "report", "balance", "receive", "limit", "using", "me", "please", "per", "a", "an", "in"]);
  const has = (s, re) => re.test(s);
  /// a line → an intent, or { err } — never anything that moves money by itself
  function parse(raw) {
    const line = String(raw || "").trim().slice(0, 300);
    if (!line) return null;
    const s = " " + lc(line).replace(/[，、]/g, ",").replace(/\s+/g, " ") + " ";
    const nums = numbers(s), toks = tokensIn(line);
    const addrs = (line.match(/0x[0-9a-fA-F]{40}/g) || []).map(lc);
    const all = has(s, /\b(all|max|everything)\b|전부|전량|모두|다 /);
    const half = has(s, /\bhalf\b|절반|반만/);
    const pctN = nums.find((n) => n.pct);
    const amtN = nums.find((n) => !n.pct && !n.at);
    const over = (() => { const m = /(\d+)\s*(d|days?|일|h|hours?|시간|w|weeks?|주)\b/.exec(s) || /(\d+)\s*(일|시간|주)/.exec(s); if (!m) return null; const u = /^(d|day|일)/.test(m[2]) ? "d" : /^(h|hour|시간)/.test(m[2]) ? "h" : "w"; return m[1] + u; })();
    const daily = has(s, /\b(daily|every day|per day|a day)\b|매일|하루에|일마다/);
    const notUsdc = toks.filter((x) => x.t.k !== "usdc");
    if (has(s, /\b(report|summary)\b|리포트|보고서|요약/)) return { type: "report" };
    if (has(s, /\b(receive|my address|deposit address|qr)\b|받기|내 주소|입금 주소/)) return { type: "receive" };
    if (has(s, /\b(take ?profit|tp)\b|익절/)) {
      const t = notUsdc[0] && notUsdc[0].t;
      const up = nums.find((n) => n.pct && n.sign >= 0) || pctN;
      const part = half ? 50 : nums.filter((n) => n.pct).length > 1 ? nums.filter((n) => n.pct)[0].v : null;
      return { type: "tp", token: t, pct: up ? up.v : null, part };
    }
    if (has(s, /\b(stop ?loss|sl)\b|손절/)) {
      const t = notUsdc[0] && notUsdc[0].t, dn = pctN;
      return { type: "sl", token: t, pct: dn ? dn.v : null };
    }
    if (has(s, /\b(dip|dips)\b|저점|물타기|떨어지면/)) {
      const t = notUsdc[0] && notUsdc[0].t;
      return { type: "dip", token: t, usd: amtN ? amtN.v : null, pct: pctN ? pctN.v : null };
    }
    if (has(s, /\bdca\b|적립|분할 ?매수|분할매수|매일 ?사/) || (daily && has(s, /\b(buy|purchase)\b|사줘|매수|구매/))) {
      const t = notUsdc[0] && notUsdc[0].t;
      let total = amtN ? amtN.v : null, ov = over;
      if (daily && total) { const days = ov && /d$/.test(ov) ? Number(ov.slice(0, -1)) : ov && /w$/.test(ov) ? Number(ov.slice(0, -1)) * 7 : null; if (days) { total *= days; ov = days + "d"; } else ov = ov || "1d"; }
      return { type: "dca", token: t, usd: total, over: ov || "7d" };
    }
    if (has(s, /\b(send|transfer|pay)\b|보내|송금|전송|이체/)) {
      const t = toks.find((x) => !addrs.includes(lc(x.w)) || x.t.base) ;
      const tok = (t && t.t) || (amtN && amtN.usd ? resolve("usdc") : null);
      const to = addrs.find((a) => !directory().some((d) => d.token === a));
      return { type: "send", token: tok, amount: amtN && !amtN.pct ? amtN.v : null, all, half, to: to || null };
    }
    const priceWord = / (at|@) (mcap |mc |market cap )?\$?(\d|\.)/.test(s) && !pctN;
    const buy = has(s, /\b(buy|purchase|ape)\b|사줘|사 줘|구매|매수|사기/), sell = has(s, /\b(sell|dump)\b|팔아|매도|팔기|정리/);
    if (priceWord && (buy || sell)) {
      const t = notUsdc[0] && notUsdc[0].t;
      const m = / (?:at|@) ((?:mcap |mc |market cap )?\$?[\d.,]+[kmb]?)/.exec(s);
      return { type: "limit", side: buy ? "buy" : "sell", token: t, usd: amtN && amtN.usd ? amtN.v : null, amount: amtN && !amtN.usd ? amtN.v : null, price: m ? m[1].trim() : null, all };
    }
    if (has(s, /\b(swap|convert|exchange|trade|change)\b|바꿔|바꾸|스왑|교환|환전/) || buy || sell) {
      let from = null, to = null, amount = amtN && !amtN.pct ? amtN.v : null, usdAmt = !!(amtN && amtN.usd);
      const withIdx = (() => { const m = / (with|using|for|by)\s/.exec(s); return m ? m.index : -1; })();
      if (buy) {
        // "buy AFROG with 1000 ARCIRCLE" / "buy $50 of AFROG" / "AFROG 50달러어치 사줘"
        const pay = withIdx >= 0 ? toks.find((x) => x.i > withIdx) : null;
        const tgt = toks.find((x) => !pay || x !== pay) ;
        to = tgt ? tgt.t : null; from = pay ? pay.t : resolve("usdc");
        if (to && from && to.k === from.k) from = resolve("usdc");
        if (amtN && !pay && !amtN.usd && tgt && tgt.i > amtN.i && tgt.i - amtN.end < 4) amount = null; // "buy 1000 AFROG": an amount out — Swap takes what you pay
      } else if (sell) {
        const intoIdx = (() => { const m = / (for|to|into|→|->)\s|로 |으로 /.exec(s); return m ? m.index : -1; })();
        const koTo = toks.find((x) => x.ro);
        const g = koTo || (intoIdx >= 0 ? toks.find((x) => x.i > intoIdx) : null), f = toks.find((x) => x !== g && (koTo || intoIdx < 0 || x.i < intoIdx));
        from = f ? f.t : null; to = g ? g.t : resolve("usdc");
      } else {
        // swap A to B (in either language the first token named is what you pay with)
        // "100 USDC를 ARCIRCLE로 바꿔줘": the one with 로 is what you get
        const koTo = toks.find((x) => x.ro);
        const f = koTo ? toks.find((x) => x !== koTo) : toks[0], g = koTo || toks.find((x) => x !== f);
        from = f ? f.t : null; to = g ? g.t : null;
        if (koTo && !f) from = resolve("usdc");
        if (from && !to && / (to|into|for|→|->) /.test(s)) { to = from; from = resolve("usdc"); }
      }
      return { type: "swap", from, to, amount, usdAmt, all, half, pct: pctN && !pctN.sign ? pctN.v : null, side: buy ? "buy" : sell ? "sell" : "swap" };
    }
    if (has(s, /\b(balance|how much|worth|holdings?|portfolio)\b|잔고|잔액|얼마|자산|보유/)) return { type: "balance" };
    return { type: "unknown" };
  }
  /// ARCIA's JSON intent (checked field by field) → the same shape parse() gives
  function fromAi(j) {
    if (!j || typeof j !== "object") return { type: "unknown" };
    const r = (w) => (w ? resolve(w) : null);
    const n = (v) => (typeof v === "number" && isFinite(v) && v > 0 ? v : null);
    switch (j.type) {
      case "send": return { type: "send", token: r(j.token) || r(j.from), amount: n(j.amount), all: !!j.all, to: isAddr(j.recipient) ? lc(j.recipient) : null, ai: true };
      case "swap": return { type: "swap", from: r(j.from) || (j.amountUsd ? r("usdc") : null), to: r(j.to), amount: n(j.amount), usdAmt: !!j.amountUsd, all: !!j.all, pct: n(j.pct), side: "swap", ai: true };
      case "dca": return { type: "dca", token: r(j.token) || r(j.to), usd: n(j.amount), over: j.over || "7d", ai: true };
      case "tp": return { type: "tp", token: r(j.token) || r(j.from), pct: n(j.pct), part: j.all ? null : n(j.amount) && n(j.amount) <= 100 ? null : null, ai: true };
      case "sl": return { type: "sl", token: r(j.token) || r(j.from), pct: n(j.pct), ai: true };
      case "dip": return { type: "dip", token: r(j.token) || r(j.to), usd: n(j.amount), pct: n(j.pct), ai: true };
      case "limit": return { type: "limit", side: /sell/i.test(j.note || "") ? "sell" : "buy", token: r(j.token) || r(j.to) || r(j.from), usd: j.amountUsd ? n(j.amount) : null, amount: j.amountUsd ? null : n(j.amount), price: j.price || null, all: !!j.all, ai: true };
      case "report": case "balance": case "receive": return { type: j.type, ai: true };
      default: return { type: "unknown", hint: j.note || null, ai: true };
    }
  }

  // ---------------- what a command becomes ----------------
  const fmtN = (n) => (P() ? P().amt(n) : String(n));
  const usdS = (n) => (P() ? P().usd(n) : "$" + n);
  /// ARCIRCLE Orders spreads a DCA over 1h, 6h, 1d, 3d, 7d or 30d: the nearest one
  function snapOver(ov) {
    const m = /^(\d+(?:\.\d+)?)\s*([hdw])$/.exec(String(ov || "7d"));
    const sec = m ? Number(m[1]) * (m[2] === "h" ? 3600 : m[2] === "w" ? 604800 : 86400) : 604800;
    const ok = [[3600, "1h"], [21600, "6h"], [86400, "1d"], [259200, "3d"], [604800, "7d"], [2592000, "30d"]];
    return ok.reduce((a, b) => (Math.abs(b[0] - sec) < Math.abs(a[0] - sec) ? b : a))[1];
  }
  /// an order line for ARCIRCLE Orders (its "type an order" box reads it: arc-order-line.js)
  function orderLine(it) {
    const n = (v) => String(Number(Number(v).toPrecision(8)));
    if (it.type === "dca") return `dca $${n(it.usd)} over ${snapOver(it.over)}`;
    if (it.type === "tp") return it.part ? `sell ${n(it.part)}% at +${n(it.pct)}%` : `sell all at +${n(it.pct)}%`;
    if (it.type === "sl") return `stop sell all at -${n(it.pct)}%`;
    if (it.type === "dip") { const deep = it.pct || 15; const top = Math.max(1, Math.round(deep / 5)); return `buy $${n(it.usd)} from -${top}% to -${n(deep)}% x4`; }
    if (it.type === "limit") return `${it.side} ${it.all ? "all" : it.usd ? "$" + n(it.usd) : n(it.amount)} at ${it.price}`;
    return "";
  }
  function ordersUrl(it) {
    const t = it.token;
    const rh = t && t.ch === "rh";
    const addr = rh ? t.token : tokenAddrOnArc(t);
    return `/arc#orders?t=${addr}${rh ? "&c=rh" : ""}&o=${encodeURIComponent(orderLine(it))}`;
  }
  /// what the command still needs before it can be shown as a card
  function missing(it) {
    const m = [];
    if (it.type === "send") { if (!it.token) m.push(T3("which coin", "어떤 코인", "哪个代币")); if (!it.amount && !it.all && !it.half) m.push(T3("how much", "얼마나", "多少")); if (!it.to) m.push(T3("the 0x address to send to", "보낼 0x 주소", "收款 0x 地址")); }
    if (it.type === "swap") { if (!it.from) m.push(T3("what to pay with", "지불할 코인", "用什么支付")); if (!it.to) m.push(T3("what to get", "받을 코인", "换成什么")); }
    if (["dca", "tp", "sl", "dip", "limit"].includes(it.type) && !it.token) m.push(T3("which coin", "어떤 코인", "哪个代币"));
    if (it.type === "dca" && !it.usd) m.push(T3("how many dollars in total", "총 몇 달러", "总共多少美元"));
    if ((it.type === "tp" || it.type === "sl") && !it.pct) m.push(T3("the % (like +20% or -10%)", "퍼센트(+20%, -10% 등)", "百分比（如 +20% 或 -10%）"));
    if (it.type === "dip" && !it.usd) m.push(T3("how many dollars", "몇 달러", "多少美元"));
    if (it.type === "limit" && !it.price) m.push(T3("the price", "가격", "价格"));
    if (it.type === "limit" && !it.usd && !it.amount && !it.all) m.push(T3("how much", "얼마나", "多少"));
    return m;
  }
  const chainName = (ch) => (ch === "rh" ? "Robinhood Chain" : "Arc");
  /// null = not read yet; an ArcPad coin missing from a finished read is 0
  const balOf = (t) => { const p = P(); if (!t) return null; if (t.base) return p.S.bal[t.k]; const h = X.held[t.token]; if (h != null) return h; return X.heldAt && X.heldFor === p.S.addr && X.scanned && X.scanned.has(t.token) ? 0 : null; };
  async function cardFor(it) {
    const p = P();
    if (!it || it.type === "unknown") return { kind: "hint", text: it && it.hint ? it.hint : T3("I didn't catch that. Try “send 5 USDC to 0x…”, “swap 100 USDC to ARCIRCLE” or “DCA $300 into ARCIRCLE over 7 days”.", "잘 못 알아들었어요. “0x…로 5 USDC 보내줘”, “100 USDC를 ARCIRCLE로 바꿔줘”, “ARCIRCLE 7일 동안 300달러 적립식 매수”처럼 말해 주세요.", "没听懂。试试“send 5 USDC to 0x…”、“swap 100 USDC to ARCIRCLE”或“DCA $300 into ARCIRCLE over 7 days”。") };
    if (it.type === "report") { const el = $("wp-report"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); buildReport(true); return { kind: "info", text: T3("Here's today's report.", "오늘의 리포트예요.", "这是今天的报告。") }; }
    if (it.type === "receive") { p.openReceive(); return null; }
    if (it.type === "balance") {
      const rows = holdings().filter((h) => h.usd > 0).sort((a, b) => b.usd - a.usd).slice(0, 4);
      const total = rows.reduce((s, h) => s + h.usd, 0);
      return { kind: "info", text: rows.length ? T3(`About ${usdS(total)} — mostly `, `약 ${usdS(total)} — 주로 `, `约 ${usdS(total)} — 主要是 `) + rows.map((h) => `${fmtN(h.n)} ${h.sym} (${usdS(h.usd)})`).join(", ") : T3("Nothing with a price yet.", "아직 가격이 있는 코인이 없어요.", "暂时没有有价格的代币。") };
    }
    const miss = missing(it);
    if (miss.length) return { kind: "need", text: T3("Almost — tell me ", "거의 다 됐어요 — ", "差一点 — 还需要") + miss.join(", ") + T3(".", "만 알려주세요.", "。"), it };
    if (it.type === "send") {
      const t = it.token, have = balOf(t);
      let amount = it.amount;
      if (it.all || it.half) { if (have == null) return { kind: "need", text: T3("I can't see that balance yet. Say an amount.", "아직 잔고를 못 읽었어요. 수량을 말해 주세요.", "还读不到余额，请说一个数量。") }; amount = Math.max(0, (it.half ? have / 2 : have) - (t.k === "usdc" ? 0.05 : t.k === "eth" ? 0.0003 : 0)); }
      const warn = [];
      if (lc(it.to) === lc(p.S.addr)) return { kind: "need", text: T3("That's your own address.", "내 주소예요.", "这是你自己的地址。") };
      if (directory().some((d) => d.token === lc(it.to)) || lc(it.to) === USDC_ERC20) return { kind: "need", text: T3("That's a coin's contract, not a wallet. Coins sent there are lost.", "그건 코인 컨트랙트 주소예요. 거기로 보내면 잃어버려요.", "这是代币合约，不是钱包。发送到那里会丢失。") };
      if (/^0x0{40}$/.test(it.to) || lc(it.to) === "0x000000000000000000000000000000000000dead") return { kind: "need", text: T3("That's a burn address — coins sent there are gone for good.", "소각 주소예요 — 보내면 영원히 사라져요.", "这是销毁地址 — 发送后将永久消失。") };
      if (have != null && amount > have + 1e-12) warn.push(T3("That's more than you have.", "가진 것보다 많아요.", "超过了你的余额。"));
      if (p.S.mode !== "demo") { try { const code = await p.rpc(t.ch, "eth_getCode", [it.to, "latest"]); if (code && code !== "0x") warn.push(T3("That address is a contract. Make sure it can receive coins.", "컨트랙트 주소예요. 코인을 받을 수 있는지 확인하세요.", "这是合约地址，请确认它能接收代币。")); } catch { /* fine */ } }
      return { kind: "send", it: { ...it, amount }, title: T3(`Send ${fmtN(amount)} ${t.sym}`, `${fmtN(amount)} ${t.sym} 보내기`, `发送 ${fmtN(amount)} ${t.sym}`), rows: [[T3("To", "받는 주소", "收款地址"), it.to], [T3("Network", "네트워크", "网络"), chainName(t.ch)], ...(t.px && amount ? [[T3("Worth about", "가치", "约值"), usdS(amount * t.px)]] : [])], warn, block: have != null && amount > have + 1e-12 };
    }
    if (it.type === "swap") {
      const f = it.from, t = it.to;
      if (f.ch !== "arc" || t.ch !== "arc") return { kind: "go", title: T3("Trade on Robinhood Chain", "Robinhood Chain에서 거래", "在 Robinhood Chain 交易"), text: T3("ARCIRCLE Swap runs on Arc. For $ARCIA and ETH, ARCIRCLE Orders trades on Robinhood Chain.", "ARCIRCLE Swap은 Arc에서 동작해요. $ARCIA와 ETH는 Robinhood Chain의 ARCIRCLE Orders에서 거래해요.", "ARCIRCLE Swap 在 Arc 上运行。$ARCIA 和 ETH 请在 Robinhood Chain 的 ARCIRCLE Orders 交易。"), href: `/arc#orders?c=rh&t=${(f.ch === "rh" ? f : t).token || ""}`, cta: T3("Open Orders", "Orders 열기", "打开 Orders") };
      if (f.k === t.k) return { kind: "need", text: T3("Pick two different coins.", "서로 다른 두 코인을 골라 주세요.", "请选择两个不同的代币。") };
      let amount = it.amount;
      const have = balOf(f);
      if (have === 0 && (it.all || it.half || it.pct)) return { kind: "need", text: T3(`You don't hold any ${f.sym} in this wallet.`, `이 지갑에는 ${f.sym}가 없어요.`, `这个钱包里没有 ${f.sym}。`) };
      if ((it.all || it.half || it.pct) && have != null) amount = Math.max(0, (it.all ? have : it.half ? have / 2 : (have * it.pct) / 100) - (f.k === "usdc" && it.all ? 0.1 : 0));
      if (it.usdAmt && f.k !== "usdc" && f.px) amount = amount / f.px;
      const inA = tokenAddrOnArc(f), outA = tokenAddrOnArc(t);
      const href = `/arc#swap?in=${inA}&out=${outA}${amount ? `&amt=${encodeURIComponent(String(Number(amount.toPrecision(10))))}` : ""}`;
      return { kind: "go", title: amount ? T3(`Swap ${fmtN(amount)} ${f.sym} → ${t.sym}`, `${fmtN(amount)} ${f.sym} → ${t.sym} 스왑`, `兑换 ${fmtN(amount)} ${f.sym} → ${t.sym}`) : T3(`Swap ${f.sym} → ${t.sym}`, `${f.sym} → ${t.sym} 스왑`, `兑换 ${f.sym} → ${t.sym}`),
        rows: [...(amount && f.px ? [[T3("Worth about", "가치", "约值"), usdS(amount * f.px)]] : []), [T3("Fee", "수수료", "手续费"), T3("0.1% — feeds the $ARCIRCLE burn", "0.1% — $ARCIRCLE 소각에 쓰여요", "0.1% — 用于 $ARCIRCLE 销毁")]],
        text: amount ? T3("Opens ARCIRCLE Swap filled in. You'll see the best route, the price impact and the fee before you confirm.", "ARCIRCLE Swap을 채운 채로 열어요. 확인 전에 최적 경로, 가격 영향, 수수료를 보여줘요.", "打开已填好的 ARCIRCLE Swap。确认前会显示最优路线、价格影响和手续费。") : T3("Swap takes what you pay, not what you get — enter the amount to pay there.", "스왑은 받을 양이 아니라 낼 양을 정해요 — 거기서 지불할 수량을 넣어 주세요.", "兑换按支付数量计算 — 请在那里输入支付数量。"),
        href, it, cta: T3("Review in Swap", "Swap에서 확인", "在 Swap 中确认") };
    }
    // strategies → ARCIRCLE Orders, the order line filled in
    if (it.type === "dca") it = { ...it, over: snapOver(it.over) };
    const t = it.token, line = orderLine(it);
    const what = {
      dca: T3(`Buy ${t.sym} with $${it.usd} spread evenly over ${it.over}`, `${it.over} 동안 $${it.usd}로 ${t.sym}를 나눠서 매수`, `在 ${it.over} 内用 $${it.usd} 分批买入 ${t.sym}`),
      tp: T3(`Sell ${it.part ? it.part + "%" : "all"} of your ${t.sym} when it's ${it.pct}% above today's price`, `${t.sym}가 지금보다 ${it.pct}% 오르면 ${it.part ? it.part + "%" : "전량"} 매도`, `${t.sym} 比现在上涨 ${it.pct}% 时卖出${it.part ? it.part + "%" : "全部"}`),
      sl: T3(`Sell all your ${t.sym} if it falls ${it.pct}% below today's price`, `${t.sym}가 지금보다 ${it.pct}% 떨어지면 전량 매도`, `${t.sym} 比现在下跌 ${it.pct}% 时全部卖出`),
      dip: T3(`Buy ${t.sym} with $${it.usd} in four steps as it dips`, `${t.sym}가 떨어질 때 $${it.usd}로 4번에 나눠 매수`, `${t.sym} 下跌时分四次用 $${it.usd} 买入`),
      limit: T3(`${it.side === "buy" ? "Buy" : "Sell"} ${t.sym} at ${it.price}`, `${t.sym}를 ${it.price}에 ${it.side === "buy" ? "매수" : "매도"}`, `以 ${it.price} ${it.side === "buy" ? "买入" : "卖出"} ${t.sym}`),
    }[it.type];
    return { kind: "go", it, title: what, rows: [[T3("Order", "주문", "订单"), line], [T3("Where", "어디서", "在哪里"), `ARCIRCLE Orders · ${chainName(t.ch)}`]],
      text: T3("Opens ARCIRCLE Orders with this filled in. You sign the order there — no gas — and your coins stay in your wallet until it fills.", "ARCIRCLE Orders를 채운 채로 열어요. 거기서 주문에 서명하면(가스비 없음) 체결될 때까지 코인은 지갑에 그대로 있어요.", "打开已填好的 ARCIRCLE Orders。在那里签名下单（无 gas），成交前代币一直留在你的钱包里。"),
      href: ordersUrl(it), cta: T3("Review in Orders", "Orders에서 확인", "在 Orders 中确认") };
  }

  // ---------------- the command bar ----------------
  const EX = () => [T3("Swap 100 USDC to ARCIRCLE", "100 USDC를 ARCIRCLE로 바꿔줘", "把 100 USDC 换成 ARCIRCLE"), T3("Send 5 USDC to 0x…", "0x…로 5 USDC 보내줘", "发送 5 USDC 到 0x…"), T3("DCA $300 into ARCIRCLE over 7 days", "ARCIRCLE 7일 동안 300달러 적립식 매수", "7 天内定投 $300 买入 ARCIRCLE"), T3("Take profit on ARCIRCLE at +25%", "ARCIRCLE +25%에서 익절", "ARCIRCLE 涨 25% 止盈"), T3("What's my balance?", "내 잔고 얼마야?", "我的余额是多少？")];
  function paintAi() {
    const el = $("wp-ai");
    if (!el || !P()) return;
    const c = X.card;
    // a new card unfolds; the same card redrawn (a status line changing) doesn't
    const fresh = !!c && X.shown !== c; X.shown = c;
    const card = !c ? "" : c.kind === "hint" || c.kind === "info" || c.kind === "need" ? `<div class="wp-c ${c.kind}${fresh ? " wp-in" : ""}" role="status"><p>${esc(c.text)}</p><button type="button" class="wp-x" data-wp="cancel" aria-label="${esc(T3("Dismiss", "닫기", "关闭"))}">×</button></div>`
      : `<div class="wp-c ${c.kind}${fresh ? " wp-in" : ""}" role="group" aria-label="${esc(c.title || "")}">
          <b class="wp-c-t">${svg(c.kind === "send" ? "send" : c.it && c.it.type === "swap" ? "swap" : c.it && c.it.type === "tp" ? "up" : c.it && c.it.type === "sl" ? "down" : c.it && c.it.type === "dip" ? "dip" : c.it && c.it.type === "limit" ? "target" : "clock")}${esc(c.title || "")}</b>
          ${c.rows && c.rows.length ? `<dl>${c.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd data-no-i18n>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
          ${c.text ? `<p>${esc(c.text)}</p>` : ""}
          ${c.warn && c.warn.length ? `<ul class="wp-warn">${c.warn.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
          ${X.msg ? `<p class="wp-msg ${esc(X.msg.k)}">${esc(X.msg.t)}${X.msg.href ? ` <a href="${esc(X.msg.href)}" target="_blank" rel="noopener">${esc(T3("View it", "내역 보기", "查看"))}</a>` : ""}</p>` : ""}
          <div class="wp-c-a">
            <button type="button" class="btn" data-wp="cancel">${esc(T3("Cancel", "취소", "取消"))}</button>
            ${c.kind === "send" ? `<button type="button" class="btn main" data-wp="send" ${c.block || X.busy ? "disabled" : ""}>${X.busy ? `<span class="wp-spin" aria-hidden="true"></span>` : ""}${esc(X.busy ? T3("Sending…", "보내는 중…", "发送中…") : T3("Confirm and send", "확인하고 보내기", "确认发送"))}</button>` : `<a class="btn main" href="${esc(c.href)}">${esc(c.cta)}${svg("arrow")}</a>`}
          </div>
        </div>`;
    el.innerHTML = `<h2><span>${esc(T3("Tell your wallet", "지갑에게 말하기", "告诉你的钱包"))}</span><small class="wp-ai-tag">${svg("spark")}AI</small></h2>
      <form class="wp-ai" id="wp-ai-f">
        <input id="wp-ai-in" maxlength="300" autocomplete="off" spellcheck="false" placeholder="${esc(T3("Swap, send, DCA, take profit…", "스왑, 송금, 적립식 매수, 익절…", "兑换、发送、定投、止盈…"))}" aria-label="${esc(T3("Tell your wallet what to do", "지갑에게 할 일을 말해 주세요", "告诉钱包要做什么"))}" value="${esc(X.draft || "")}">
        <button type="submit" class="btn main" ${X.reading ? "disabled" : ""}>${X.reading ? `<span class="wp-spin"></span>` : svg("arrow")}<span class="vh">${esc(T3("Go", "실행", "执行"))}</span></button>
      </form>
      ${c ? card : `<div class="wp-ex">${EX().map((e) => `<button type="button" data-wp-ex>${esc(e)}</button>`).join("")}</div>`}
      <p class="wp-fine">${esc(T3("Nothing moves until you confirm it and sign in your own wallet. Commands are read on this page; only ones it can't read go to ARCIA.", "직접 확인하고 내 지갑에서 서명하기 전에는 아무것도 움직이지 않아요. 명령은 이 페이지에서 읽고, 못 읽은 것만 ARCIA에게 보내요.", "在你确认并用自己的钱包签名之前，什么都不会转出。命令在本页解析，解析不了的才交给 ARCIA。"))}</p>`;
  }
  async function run(text) {
    if (!P()) return;
    X.draft = text; X.msg = null; X.reading = true; paintAi();
    let it = parse(text);
    if (!it || it.type === "unknown" || (missing(it).length && !["send"].includes(it.type))) {
      // what the wallet couldn't read itself: ARCIA turns it into JSON (checked here)
      try {
        const r = await fetch("/api/arcia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "intent", text, lang: lang(), tokens: directory().map((d) => d.sym).slice(0, 80) }) });
        const j = r.ok ? await r.json() : null;
        if (j && j.intent) {
          const ai = fromAi(j.intent);
          // an address only counts if the user typed it
          if (ai.to && !lc(text).includes(ai.to)) ai.to = null;
          if (ai.type !== "unknown" || !it || it.type === "unknown") it = ai;
        }
      } catch { /* the wallet's own reading stands */ }
    }
    X.card = await cardFor(it);
    X.reading = false;
    paintAi();
    const f = document.querySelector("#wp-ai .wp-c .btn.main"); if (f && X.card && X.card.kind !== "info") f.focus({ preventScroll: true });
  }
  async function doSend() {
    const p = P(), c = X.card;
    if (!c || c.kind !== "send" || X.busy) return;
    const it = c.it, t = it.token;
    X.busy = true; X.msg = { k: "", t: T3("Confirm in the wallet window…", "지갑 창에서 확인해 주세요…", "请在钱包窗口中确认…") }; paintAi();
    try {
      if (p.S.mode === "demo") {
        await new Promise((r) => setTimeout(r, 900));
        if (t.base) p.S.demoBal[t.k] = Math.max(0, (p.S.demoBal[t.k] || 0) - it.amount);
        p.paintCoins();
        X.msg = { k: "ok", t: T3("Sent (demo).", "보냈어요 (데모).", "已发送（演示）。") };
      } else {
        let dec = t.dec;
        if (dec == null) { const h = await p.rpc(t.ch, "eth_call", [{ to: t.token, data: "0x313ce567" }, "latest"]); dec = parseInt(h, 16); }
        const wei = BigInt(Math.floor(it.amount * 1e6)) * 10n ** BigInt(Math.max(0, dec - 6)) / (dec < 6 ? 10n ** BigInt(6 - dec) : 1n);
        const tx = t.token ? { from: p.S.addr, to: t.token, data: "0xa9059cbb" + p.pad(it.to) + wei.toString(16).padStart(64, "0") } : { from: p.S.addr, to: it.to, value: "0x" + wei.toString(16) };
        await p.switchTo(t.ch);
        const h = await p.eth().request({ method: "eth_sendTransaction", params: [tx] });
        X.msg = { k: "", t: T3("Sending…", "보내는 중…", "发送中…") }; paintAi();
        await p.waitTx(t.ch, h);
        X.msg = { k: "ok", t: T3("Sent.", "보냈어요.", "已发送。"), href: p.CH[t.ch].ex + "/tx/" + h };
        setTimeout(() => { p.loadBalances(); loadHeld(true); }, 1500);
      }
    } catch (e) {
      const m = String((e && (e.message || e.reason)) || "");
      X.msg = { k: "err", t: e && (e.code === 4001 || /reject|denied|cancel/i.test(m)) ? T3("You cancelled it.", "취소했어요.", "你已取消。") : /insufficient funds|gas/i.test(m) ? T3("Not enough for gas. Keep a little USDC on Arc or ETH on Robinhood Chain.", "가스비가 부족해요. Arc에는 USDC를, Robinhood Chain에는 ETH를 조금 남겨 두세요.", "gas 不足。在 Arc 上留一点 USDC，在 Robinhood Chain 上留一点 ETH。") : T3("Something went wrong. Try again.", "문제가 생겼어요. 다시 시도해 주세요.", "出了点问题，请重试。") };
    }
    X.busy = false; paintAi();
  }

  // ---------------- ArcPad coins the wallet holds ----------------
  async function loadLaunches() {
    if (X.launches.length) return;
    const j = await fetch("/api/c?view=launches").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (j && Array.isArray(j.launches)) X.launches = j.launches;
  }
  /// one JSON-RPC batch per 40 coins: balanceOf(wallet) on each
  async function loadHeld(force) {
    const p = P(), a = p && p.S.addr;
    if (!a || p.S.mode === "demo") { X.held = {}; paintHeld(); return; }
    if (!force && X.heldFor === a && Date.now() - X.heldAt < 60000) return;
    await loadLaunches();
    const toks = X.launches.map((l) => lc(l.token)).filter(isAddr).slice(0, 400);
    const held = {};
    for (let i = 0; i < toks.length; i += 40) {
      const part = toks.slice(i, i + 40);
      const body = part.map((t, k) => ({ jsonrpc: "2.0", id: k, method: "eth_call", params: [{ to: t, data: "0x70a08231" + p.pad(a) }, "latest"] }));
      try {
        const r = await fetch(p.CH.arc.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json();
        for (const x of Array.isArray(j) ? j : []) { if (x && x.result && x.result !== "0x") { const v = Number(BigInt(x.result) / 10n ** 12n) / 1e6; if (v > 0) held[part[x.id]] = v; } }
      } catch { /* the next read tries again */ }
    }
    X.held = held; X.heldAt = Date.now(); X.heldFor = a; X.scanned = new Set(toks);
    paintHeld();
    p.paintCoins();
  }
  function heldRows() {
    return directory().filter((d) => !d.base && X.held[d.token] > 0).map((d) => ({ ...d, n: X.held[d.token], usd: d.px ? X.held[d.token] * d.px : null })).sort((a, b) => (b.usd || 0) - (a.usd || 0));
  }
  function paintHeld() {
    const el = $("wp-held");
    if (!el) return;
    const rows = heldRows();
    el.hidden = !rows.length;
    el.innerHTML = rows.map((r) => `<li><a class="tok" href="/arc#coin/${esc(r.token)}"><span class="ic">${r.img ? `<img src="${esc(r.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="wp-l">${esc(r.sym.slice(0, 1))}</span>`}<em style="--c:#2f6bff">A</em></span><span><b>${esc(r.sym)}</b><small>${esc(r.name || "ArcPad")}</small></span><span class="v"><b>${esc(fmtN(r.n))}</b><small>${esc(r.usd != null ? usdS(r.usd) : "—")}</small></span></a></li>`).join("");
    paintChains();
  }
  /// every holding with a value: the page's coins and the ArcPad coins
  function holdings() {
    const p = P(), out = [];
    for (const c of p.COINS) { const n = p.S.bal[c.k], px = p.S.px[c.k]; if (n != null) out.push({ k: c.k, sym: c.sym.replace(/^\$/, ""), ch: c.ch, n, usd: px != null ? n * px : null }); }
    if (p.S.vea && p.S.vea.position) out.push({ k: "vearcia", sym: "veARCIA", ch: "rh", n: p.S.vea.position.amount, usd: p.S.px.arcia ? p.S.vea.position.amount * p.S.px.arcia : null });
    for (const r of heldRows()) out.push({ k: r.token, sym: r.sym, ch: "arc", n: r.n, usd: r.usd });
    return out;
  }
  function paintChains() {
    const el = $("wp-chains");
    if (!el || !P() || !P().S.addr) return;
    const hs = holdings(), sum = (ch) => hs.filter((h) => h.ch === ch).reduce((s, h) => s + (h.usd || 0), 0);
    const h = `<span><i class="arc"></i>Arc <b data-no-i18n>${esc(usdS(sum("arc")))}</b></span><span><i class="rh"></i>Robinhood Chain <b data-no-i18n>${esc(usdS(sum("rh")))}</b></span>`;
    if (el.__h === h) return;
    // the split eases in once, the first time it's drawn for this wallet
    if (!el.__h || el.__for !== P().S.addr) { el.classList.remove("wp-first"); void el.offsetWidth; el.classList.add("wp-first"); }
    el.__h = h; el.__for = P().S.addr;
    el.innerHTML = h;
  }

  // ---------------- Today's report ----------------
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const SNAP = (a) => "arcwallet.snap." + lc(a);
  /// one snapshot a day in this browser (the latest of the day), at most 30
  function snapshot() {
    const p = P(), a = p.S.addr;
    if (!a) return;
    const hs = holdings();
    if (!hs.length || hs.some((h) => (h.k === "usdc" || h.k === "arcircle") && h.usd == null && h.n > 0)) return; // prices not in yet
    const total = hs.reduce((s, h) => s + (h.usd || 0), 0);
    const list = ls.get(SNAP(a), []).filter((x) => x && x.d);
    const today = dayKey(), byK = {};
    for (const h of hs) if (h.usd != null) byK[h.sym] = Math.round(h.usd * 100) / 100;
    const row = { d: today, total: Math.round(total * 100) / 100, h: byK };
    if (list.length && list[list.length - 1].d === today) list[list.length - 1] = row; else list.push(row);
    ls.set(SNAP(a), list.slice(-30));
  }
  async function loadSwaps() {
    const p = P(), a = p.S.addr;
    if (!a || p.S.mode === "demo" || !isAddr(SWAP())) { X.swaps = null; return; }
    if (X.swapsFor === a && X.swaps && Date.now() - X.swaps.at < 300000) return;
    try {
      const latest = parseInt(await p.rpc("arc", "eth_blockNumber", []), 16);
      const head = await p.rpc("arc", "eth_getBlockByNumber", ["0x" + latest.toString(16), false]);
      const since = Number(head.timestamp) - 86400;
      const rows = [];
      for (let hi = latest, k = 0; k < 20 && hi > SWAP_FROM(); k++) {
        const lo = Math.max(SWAP_FROM(), hi - 9999);
        const logs = await p.rpc("arc", "eth_getLogs", [{ address: SWAP(), topics: [TOPIC_SWAPPED, "0x" + p.pad(a)], fromBlock: "0x" + lo.toString(16), toBlock: "0x" + hi.toString(16) }]);
        rows.push(...logs);
        const b = await p.rpc("arc", "eth_getBlockByNumber", ["0x" + lo.toString(16), false]);
        if (Number(b.timestamp) < since) break;
        hi = lo - 1;
      }
      let usd = 0, burned = 0;
      const ARC = lc(p.COINS.find((c) => c.k === "arcircle").token);
      for (const l of rows) {
        const d = String(l.data).slice(2), tin = "0x" + l.topics[2].slice(26), tout = "0x" + l.topics[3].slice(26);
        const aIn = BigInt("0x" + d.slice(0, 64)), aOut = BigInt("0x" + d.slice(64, 128)), ft = "0x" + d.slice(128 + 24, 192), fee = BigInt("0x" + d.slice(192, 256));
        if (lc(tin) === USDC_ERC20) usd += Number(aIn) / 1e6; else if (lc(tout) === USDC_ERC20) usd += Number(aOut) / 1e6;
        else if (lc(tin) === ARC && p.S.px.arcircle) usd += (Number(aIn) / 1e18) * p.S.px.arcircle; else if (lc(tout) === ARC && p.S.px.arcircle) usd += (Number(aOut) / 1e18) * p.S.px.arcircle;
        if (lc(ft) === ARC) burned += Number(fee) / 2e18;
      }
      X.swaps = { n: rows.length, usd, burned, at: Date.now() }; X.swapsFor = a;
    } catch { X.swaps = X.swaps || null; }
  }
  async function loadRefs() {
    const p = P(), a = p.S.addr;
    if (!a || p.S.mode === "demo") { X.refs = p.S.mode === "demo" ? { wallets: 3, trades: 14, swaps: 6, usd: 412.5, points: 712, recent: [] } : null; X.refsFor = a; return; }
    if (X.refsFor === a && X.refs && Date.now() - X.refs.at < 120000) return;
    const j = await fetch("/api/social?refstats=" + a).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    X.refs = j ? { ...j, points: j.points != null ? j.points : (j.wallets || 0) * 100 + Math.floor(j.usd || 0), at: Date.now() } : null; X.refsFor = a;
  }
  async function buildReport(force) {
    const p = P(), a = p && p.S.addr;
    if (!a) return;
    snapshot();
    await Promise.all([loadSwaps(), loadRefs()]);
    const list = ls.get(SNAP(a), []);
    const today = list[list.length - 1], prev = list.length > 1 ? list[list.length - 2] : null;
    const hs = holdings();
    const total = hs.reduce((s, h) => s + (h.usd || 0), 0);
    const moves = prev ? hs.filter((h) => h.usd != null).map((h) => ({ sym: h.sym, d: h.usd - (prev.h[h.sym] || 0) })).filter((m) => Math.abs(m.d) >= 0.01).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 3) : [];
    X.report = { day: dayKey(), total, prev, change: prev ? total - prev.total : null, moves, swaps: X.swaps, refs: X.refs, list, top: hs.filter((h) => h.usd > 0).sort((x, y) => y.usd - x.usd).slice(0, 3) };
    paintReport();
    // ARCIA's few lines, once a day (or when asked)
    const k = "arcwallet.rtext." + lc(a) + "." + dayKey() + "." + lang();
    const have = ls.get(k, null);
    if (have && !force) { X.report.text = have; paintReport(); return; }
    const facts = { totalUsd: Math.round(total * 100) / 100, changeUsd: X.report.change != null ? Math.round(X.report.change * 100) / 100 : null, sinceDay: prev ? prev.d : null,
      top: X.report.top.map((h) => ({ coin: h.sym, usd: Math.round(h.usd * 100) / 100 })), moved: moves.map((m) => ({ coin: m.sym, usd: Math.round(m.d * 100) / 100 })),
      swaps24h: X.swaps ? { count: X.swaps.n, usd: Math.round(X.swaps.usd * 100) / 100, arcircleBurned: Math.round(X.swaps.burned) } : null, referralPoints: X.refs ? X.refs.points : null, demo: p.S.mode === "demo" };
    try {
      const r = await fetch("/api/arcia", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "wreport", facts, lang: lang() }) });
      const j = r.ok ? await r.json() : null;
      if (j && j.text) { X.report.text = j.text; ls.set(k, j.text); }
    } catch { /* the plain report stands */ }
    paintReport();
  }
  function spark(list) {
    const v = list.map((x) => x.total).filter((x) => isFinite(x));
    if (v.length < 2) return "";
    const W = 300, H = 56, lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || hi * 0.02 || 1;
    const pts = v.map((x, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${(H - 4 - ((x - lo) / span) * (H - 8)).toFixed(1)}`).join(" ");
    const up = v[v.length - 1] >= v[0];
    return `<svg class="wp-spark ${up ? "up" : "dn"}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(T3(`Value over the last ${v.length} reports`, `최근 ${v.length}번 리포트의 가치`, `最近 ${v.length} 份报告的价值`))}"><polyline points="${pts}"/></svg>`;
  }
  function paintReport() {
    const el = $("wp-report");
    if (!el || !P() || !P().S.addr) return;
    const r = X.report;
    const d = new Date();
    const dateS = d.toLocaleDateString(lang() === "ko" ? "ko-KR" : lang() === "zh" ? "zh-CN" : "en-US", { month: "long", day: "numeric", weekday: "short" });
    if (!r) { el.innerHTML = `<h2><span>${esc(T3("Today's report", "오늘의 리포트", "今日报告"))}</span></h2><div class="wp-rep"><p class="wp-fine"><span class="wp-spin"></span> ${esc(T3("Putting it together…", "정리하는 중…", "整理中…"))}</p></div>`; return; }
    const ch = r.change, pct = r.prev && r.prev.total > 0 ? (ch / r.prev.total) * 100 : null;
    const plain = r.prev ? T3(`Your wallet is worth ${usdS(r.total)}, ${ch >= 0 ? "up" : "down"} ${usdS(Math.abs(ch))} since ${r.prev.d}.`, `지갑 가치는 ${usdS(r.total)}로, ${r.prev.d} 이후 ${usdS(Math.abs(ch))} ${ch >= 0 ? "올랐어요" : "내렸어요"}.`, `你的钱包价值 ${usdS(r.total)}，自 ${r.prev.d} 以来${ch >= 0 ? "上涨" : "下跌"} ${usdS(Math.abs(ch))}。`)
      : T3(`Your wallet is worth ${usdS(r.total)}. Tomorrow's report compares against today.`, `지갑 가치는 ${usdS(r.total)}예요. 내일 리포트부터 오늘과 비교해요.`, `你的钱包价值 ${usdS(r.total)}。明天的报告会和今天对比。`);
    el.innerHTML = `<h2><span>${esc(T3("Today's report", "오늘의 리포트", "今日报告"))}</span><button type="button" data-wp="report">${svg("refresh")}${esc(T3("Refresh", "새로고침", "刷新"))}</button></h2>
      <div class="wp-rep">
        <div class="wp-rep-h"><small>${esc(dateS)}</small><b data-no-i18n>${esc(usdS(r.total))}</b>${ch != null ? `<em class="${ch >= 0 ? "up" : "dn"}" data-no-i18n>${ch >= 0 ? "+" : "−"}${esc(usdS(Math.abs(ch)).replace("$", "$"))}${pct != null && isFinite(pct) ? ` (${ch >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)` : ""}</em>` : ""}</div>
        ${spark(r.list)}
        <p class="wp-rep-ai">${r.text ? `<i>${svg("spark")}</i>${esc(r.text)}` : esc(plain)}</p>
        <dl class="wp-rep-g">
          <div><dt>${esc(T3("Biggest holdings", "가장 큰 보유", "最大持仓"))}</dt><dd data-no-i18n>${r.top.length ? r.top.map((h) => `${esc(h.sym)} ${esc(usdS(h.usd))}`).join(" · ") : "—"}</dd></div>
          <div><dt>${esc(T3("What moved", "변동", "变动"))}</dt><dd data-no-i18n>${r.moves.length ? r.moves.map((m) => `<span class="${m.d >= 0 ? "up" : "dn"}">${esc(m.sym)} ${m.d >= 0 ? "+" : "−"}${esc(usdS(Math.abs(m.d)))}</span>`).join(" · ") : esc(T3("Nothing yet — check back tomorrow", "아직 없어요 — 내일 다시 확인하세요", "暂无 — 明天再来看"))}</dd></div>
          <div><dt>${esc(T3("Swaps, last 24h", "최근 24시간 스왑", "最近 24 小时兑换"))}</dt><dd data-no-i18n>${r.swaps ? `${r.swaps.n} · ${esc(usdS(r.swaps.usd))}${r.swaps.burned >= 1 ? ` · <span class="wp-burn">${svg("flame")}${esc(fmtN(r.swaps.burned))} $ARCIRCLE ${esc(T3("burned", "소각", "已销毁"))}</span>` : ""}` : "—"}</dd></div>
          <div><dt>${esc(T3("Invite points", "초대 포인트", "邀请积分"))}</dt><dd data-no-i18n>${r.refs ? esc(Number(r.refs.points || 0).toLocaleString("en-US")) : "—"}</dd></div>
        </dl>
        <p class="wp-fine">${esc(T3("A new report each day, from this wallet's balances and its swaps on Arc. One snapshot a day stays in this browser. Not financial advice.", "매일 새 리포트예요 — 이 지갑의 잔고와 Arc 스왑 기록으로 만들어요. 하루 한 번의 스냅샷은 이 브라우저에만 저장돼요. 투자 조언이 아니에요.", "每天一份新报告，根据这个钱包的余额和它在 Arc 上的兑换生成。每天一个快照只保存在这个浏览器中。不构成投资建议。"))}</p>
      </div>`;
  }

  // ---------------- Automate ----------------
  const STRATS = () => [
    { k: "dca", icon: "clock", t: T3("DCA", "적립식 매수", "定投"), d: T3("Buy a little at a time", "조금씩 나눠 사기", "分批买入") },
    { k: "tp", icon: "up", t: T3("Take profit", "익절", "止盈"), d: T3("Sell when it's up", "오르면 팔기", "上涨时卖出") },
    { k: "sl", icon: "down", t: T3("Stop loss", "손절", "止损"), d: T3("Sell if it falls", "떨어지면 팔기", "下跌时卖出") },
    { k: "dip", icon: "dip", t: T3("Buy the dip", "저점 매수", "逢低买入"), d: T3("Four buys as it drops", "떨어질 때 4번 나눠 사기", "下跌时分四次买") },
    { k: "limit", icon: "target", t: T3("Limit order", "지정가 주문", "限价单"), d: T3("Buy or sell at a price", "정한 가격에 사고팔기", "按指定价格买卖") },
  ];
  function autoToks() { return directory().filter((d) => d.ch === "arc" && d.k !== "usdc").slice(0, 60); }
  function paintAuto() {
    const el = $("wp-auto");
    if (!el || !P()) return;
    const a = X.auto, toks = autoToks();
    const opt = (sel) => toks.map((t) => `<option value="${esc(t.k)}"${t.k === sel ? " selected" : ""}>${esc(t.sym)}</option>`).join("");
    let form = "";
    if (a) {
      const f = a.f;
      const fields = {
        dca: `<label>${esc(T3("Total", "총액", "总额"))}<span class="wp-in">$<input data-wpf="usd" inputmode="decimal" value="${esc(f.usd || "")}"></span></label><label>${esc(T3("Over", "기간", "期间"))}<select data-wpf="over">${["6h", "1d", "3d", "7d", "30d"].map((o) => `<option${f.over === o ? " selected" : ""}>${o}</option>`).join("")}</select></label>`,
        tp: `<label>${esc(T3("When it's up", "오르면", "涨幅"))}<span class="wp-in">+<input data-wpf="pct" inputmode="decimal" value="${esc(f.pct || "")}">%</span></label><label>${esc(T3("Sell", "매도", "卖出"))}<select data-wpf="part">${[["", T3("All", "전량", "全部")], ["50", "50%"], ["25", "25%"]].map(([v, l]) => `<option value="${v}"${String(f.part || "") === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`,
        sl: `<label>${esc(T3("If it falls", "떨어지면", "跌幅"))}<span class="wp-in">−<input data-wpf="pct" inputmode="decimal" value="${esc(f.pct || "")}">%</span></label>`,
        dip: `<label>${esc(T3("Spend", "투입", "投入"))}<span class="wp-in">$<input data-wpf="usd" inputmode="decimal" value="${esc(f.usd || "")}"></span></label><label>${esc(T3("Down to", "최대 하락", "最低跌至"))}<span class="wp-in">−<input data-wpf="pct" inputmode="decimal" value="${esc(f.pct || "15")}">%</span></label>`,
        limit: `<label>${esc(T3("Side", "구분", "方向"))}<select data-wpf="side"><option value="buy"${f.side !== "sell" ? " selected" : ""}>${esc(T3("Buy", "매수", "买入"))}</option><option value="sell"${f.side === "sell" ? " selected" : ""}>${esc(T3("Sell", "매도", "卖出"))}</option></select></label><label>${esc(T3("Amount", "금액", "金额"))}<span class="wp-in">$<input data-wpf="usd" inputmode="decimal" value="${esc(f.usd || "")}"></span></label><label>${esc(T3("Price", "가격", "价格"))}<span class="wp-in"><input data-wpf="price" inputmode="decimal" placeholder="0.0001" value="${esc(f.price || "")}"></span></label>`,
      }[a.k];
      const it = autoIntent();
      const ok = it && !missing(it).length;
      form = `<div class="wp-af"><label>${esc(T3("Coin", "코인", "代币"))}<select data-wpf="tok">${opt(f.tok)}</select></label>${fields}
        <div class="wp-af-p">${ok ? `<code data-no-i18n>${esc(orderLine(it))}</code>` : `<small>${esc(T3("Fill in the numbers", "숫자를 채워 주세요", "请填写数字"))}</small>`}</div>
        <div class="wp-c-a"><button type="button" class="btn" data-wp="auto-x">${esc(T3("Cancel", "취소", "取消"))}</button>${ok ? `<a class="btn main" href="${esc(ordersUrl(it))}">${esc(T3("Review in Orders", "Orders에서 확인", "在 Orders 中确认"))}${svg("arrow")}</a>` : `<button type="button" class="btn main" disabled>${esc(T3("Review in Orders", "Orders에서 확인", "在 Orders 中确认"))}</button>`}</div></div>`;
    }
    el.innerHTML = `<h2><span>${esc(T3("Automate", "자동 매매", "自动交易"))}</span><a href="/arc#orders">${esc(T3("My orders", "내 주문", "我的订单"))}</a></h2>
      <div class="wp-strats" role="list">${STRATS().map((s) => `<button type="button" role="listitem" class="wp-st${a && a.k === s.k ? " on" : ""}" data-wp-st="${s.k}" aria-expanded="${!!(a && a.k === s.k)}"><i>${svg(s.icon)}</i><b>${esc(s.t)}</b><small>${esc(s.d)}</small></button>`).join("")}</div>
      ${form}
      <p class="wp-fine">${esc(T3("Runs on ARCIRCLE Orders: you sign each order once (no gas), the executor fills it at your price or better, and your coins stay in your wallet until then. Cancel any time.", "ARCIRCLE Orders로 동작해요: 주문마다 한 번 서명하면(가스비 없음) 실행기가 내 가격이나 더 좋은 가격에 체결하고, 그때까지 코인은 지갑에 그대로 있어요. 언제든 취소할 수 있어요.", "通过 ARCIRCLE Orders 运行：每个订单签名一次（无 gas），执行器按你的价格或更好价格成交，在此之前代币一直留在你的钱包里。随时可以取消。"))}</p>`;
  }
  function autoIntent() {
    const a = X.auto; if (!a) return null;
    const f = a.f, t = directory().find((d) => d.k === f.tok) || null, n = (v) => (Number(v) > 0 ? Number(v) : null);
    if (a.k === "dca") return { type: "dca", token: t, usd: n(f.usd), over: f.over || "7d" };
    if (a.k === "tp") return { type: "tp", token: t, pct: n(f.pct), part: n(f.part) };
    if (a.k === "sl") return { type: "sl", token: t, pct: n(f.pct) };
    if (a.k === "dip") return { type: "dip", token: t, usd: n(f.usd), pct: n(f.pct) };
    if (a.k === "limit") return { type: "limit", side: f.side || "buy", token: t, usd: n(f.usd), price: n(f.price) ? String(f.price) : null };
    return null;
  }

  // ---------------- Invite friends ----------------
  function paintRef() {
    const el = $("wp-ref");
    if (!el || !P() || !P().S.addr) return;
    const p = P(), r = X.refs, link = `https://www.arcircle.app/?ref=${lc(p.S.addr)}`;
    el.innerHTML = `<h2><span>${esc(T3("Invite friends", "친구 초대", "邀请好友"))}</span></h2>
      <div class="wp-ref">
        <div class="wp-ref-h"><i>${svg("gift")}</i><div><b data-no-i18n>${r ? esc(Number(r.points || 0).toLocaleString("en-US")) : "—"}</b><small>${esc(T3("points", "포인트", "积分"))}</small></div></div>
        <div class="wp-ref-g">
          <div><b data-no-i18n>${r ? esc(r.wallets || 0) : "—"}</b><small>${esc(T3("friends joined", "가입한 친구", "加入的好友"))}</small></div>
          <div><b data-no-i18n>${r ? esc((r.trades || 0) + (r.launches || 0)) : "—"}</b><small>${esc(T3("their trades", "친구들의 거래", "好友交易"))}</small></div>
          <div><b data-no-i18n>${r ? esc(usdS(r.usd || 0)) : "—"}</b><small>${esc(T3("they traded", "친구들의 거래액", "好友交易额"))}</small></div>
        </div>
        <div class="wp-link"><code data-no-i18n>${esc(link.replace("https://www.", ""))}</code><button type="button" class="btn" data-wp="ref-copy">${esc(T3("Copy", "복사", "复制"))}</button>${navigator.share ? `<button type="button" class="btn main" data-wp="ref-share">${esc(T3("Share", "공유", "分享"))}</button>` : ""}</div>
        <p class="wp-fine">${esc(T3("100 points for each friend who joins through your link and trades, plus 1 point for every $1 they trade on ArcPad and ARCIRCLE Swap. Points count from now; what they turn into is announced later.", "내 링크로 들어와 거래한 친구 1명당 100포인트, 친구가 ArcPad와 ARCIRCLE Swap에서 거래한 1달러당 1포인트예요. 포인트는 지금부터 쌓이고, 무엇으로 바뀌는지는 나중에 공지해요.", "每位通过你的链接加入并交易的好友 100 积分，好友在 ArcPad 和 ARCIRCLE Swap 每交易 $1 再得 1 积分。积分从现在开始累计，具体兑换方式日后公布。"))}${p.S.mode === "demo" ? " " + esc(T3("(Demo numbers.)", "(데모 숫자예요.)", "（演示数据。）")) : ""}</p>
      </div>`;
  }

  // ---------------- wiring ----------------
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-wp],[data-wp-ex],[data-wp-st]");
    if (!b || !P()) return;
    if (b.dataset.wpEx != null && "wpEx" in b.dataset) { const i = $("wp-ai-in"); if (i) { i.value = b.textContent.replace("0x…", "0x"); i.focus(); X.draft = i.value; } return; }
    if (b.dataset.wpSt) { const k = b.dataset.wpSt; X.auto = X.auto && X.auto.k === k ? null : { k, f: { tok: (autoToks()[0] || {}).k, over: "7d", pct: k === "tp" ? "25" : k === "sl" ? "10" : k === "dip" ? "15" : "", side: "buy" } }; paintAuto(); return; }
    const a = b.dataset.wp;
    if (a === "cancel") { X.card = null; X.msg = null; X.draft = ""; paintAi(); }
    else if (a === "send") doSend();
    else if (a === "report") { X.report = null; paintReport(); buildReport(true); }
    else if (a === "auto-x") { X.auto = null; paintAuto(); }
    else if (a === "ref-copy") P().copy(`https://www.arcircle.app/?ref=${lc(P().S.addr)}`);
    else if (a === "ref-share") navigator.share({ text: T3("Join me on ARCIRCLE — one wallet for Arc and Robinhood Chain, with AI built in.", "ARCIRCLE에서 같이 해요 — AI가 들어간 Arc·Robinhood Chain 지갑이에요.", "来 ARCIRCLE 一起玩 — 内置 AI 的 Arc 与 Robinhood Chain 钱包。"), url: `https://www.arcircle.app/?ref=${lc(P().S.addr)}` }).catch(() => {});
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "wp-ai-f") return;
    e.preventDefault();
    const i = $("wp-ai-in"), v = i ? i.value.trim() : "";
    if (v && !X.reading) run(v);
  });
  document.addEventListener("input", (e) => {
    const k = e.target.dataset && e.target.dataset.wpf;
    if (k && X.auto) { X.auto.f[k] = e.target.value; const keep = e.target.matches("input") ? [k, e.target.selectionStart] : null; paintAuto(); if (keep) { const n = document.querySelector(`[data-wpf="${keep[0]}"]`); if (n) { n.focus(); try { n.setSelectionRange(keep[1], keep[1]); } catch { /* fine */ } } } }
    if (e.target.id === "wp-ai-in") X.draft = e.target.value;
  });
  document.addEventListener("change", (e) => { const k = e.target.dataset && e.target.dataset.wpf; if (k && X.auto && e.target.matches("select")) { X.auto.f[k] = e.target.value; paintAuto(); } });

  let shownFor = "";
  function onShow() {
    const p = P();
    if (!p || !p.S.addr) return;
    if (shownFor !== p.S.addr + p.S.mode) { shownFor = p.S.addr + p.S.mode; X.card = null; X.report = null; X.refs = null; X.swaps = null; X.held = {}; }
    paintAi(); paintAuto(); paintReport(); paintRef(); paintHeld();
    loadLaunches().then(() => { paintAuto(); loadHeld(); });
    loadRefs().then(paintRef);
  }
  function onBal() { paintChains(); if (!X.report || Date.now() - (X.report.at || 0) > 600000) { buildReport(false).then(() => { if (X.report) X.report.at = Date.now(); paintRef(); }); } }
  document.addEventListener("arcwallet:show", onShow);
  document.addEventListener("arcwallet:bal", onBal);
  function boot() { const p = P(); if (!p) return; p.onLang.push(() => { paintAi(); paintAuto(); paintReport(); paintRef(); paintChains(); }); if (p.S.addr) { onShow(); onBal(); } }
  if (P()) boot(); else document.addEventListener("arcwallet:page", boot, { once: true });
  window.arcWalletPlus = { snapOver, parse, fromAi, cardFor, orderLine, ordersUrl, resolve, directory, extraUsd: () => heldRows().reduce((s, r) => s + (r.usd || 0), 0), _X: X };
})();
