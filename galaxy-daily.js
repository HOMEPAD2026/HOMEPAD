// galaxy-daily.js — ARC GALAXY's daily records panel (GXD2): a day's report, 7 / 30-day trends, a report card picture.
// Loaded by galaxy.js when 📅 is pressed; reads /api/social?arc=galaxy-daily (api/_galaxy-daily.mjs keeps a doc a UTC
// day, read block by block on a clock). Nothing is posted anywhere: the card downloads / shares from the viewer's device
// and the summary text is copied for the viewer to post themselves.
const API = "/api/social?arc=galaxy-daily";
const W = {
  ko: { title: "Arc 일일 기록", day: "하루", d7: "7일", d30: "30일", utc: "UTC 기준", txs: "트랜잭션", usd: "USDC 이동", wallets: "활동 지갑 (추정)", peak: "최고 초당 트랜잭션 (1분)", avg: "평균 초당 트랜잭션", ok: "성공률", fee: "낸 수수료 (USDC)", feeAvg: "평균 수수료", auth: "서명 결제 (EIP-3009)", born: "새 컨트랙트", bIn: "CCTP로 들어온 USDC", bOut: "CCTP로 나간 USDC", cov: "이 날의 {p}%를 읽었어요", covFull: "하루 전체를 읽었어요", covNote: "줄무늬 = 기록이 시작되기 전이거나 읽지 못한 시간", hourTx: "시간별 트랜잭션 (UTC)", hourUsd: "시간별 USDC 이동 (UTC)", kinds: "종류별", top: "가장 바쁜 컨트랙트", cctp: "CCTP 브리지 — 체인별", inn: "들어옴", out: "나감", whale: "가장 큰 USDC 이동", pblock: "가장 바쁜 블록", card: "리포트 카드 저장", copy: "요약 복사", copied: "요약을 복사했어요 — 붙여넣어 올려 보세요", saved: "리포트 카드를 저장했어요", none: "아직 기록이 없어요 — 수집기가 방금 시작됐어요. 몇 분 뒤 다시 열어 보세요.", loading: "기록을 불러오는 중…", fail: "기록을 불러오지 못했어요", tTx: "하루 트랜잭션", tUsd: "하루 USDC 이동", tW: "하루 활동 지갑", tFee: "트랜잭션당 평균 수수료", vsPrev: "전날 대비", partial: "일부만 읽은 날", today: "오늘 (진행 중)", noCctp: "이 날은 CCTP 이동이 없었어요", since: "기록 시작: {d}", table: "표로 보기", hour: "시", tps: "tx/s", txsPer: "트랜잭션", none2: "없음", other: "기타" },
  zh: { title: "Arc 每日记录", day: "单日", d7: "7 天", d30: "30 天", utc: "按 UTC", txs: "交易", usd: "USDC 流动", wallets: "活跃钱包（估算）", peak: "最高每秒交易（1 分钟）", avg: "平均每秒交易", ok: "成功率", fee: "支付的手续费（USDC）", feeAvg: "平均手续费", auth: "签名支付（EIP-3009）", born: "新合约", bIn: "经 CCTP 流入的 USDC", bOut: "经 CCTP 流出的 USDC", cov: "已读取当天的 {p}%", covFull: "已读取全天", covNote: "斜纹 = 记录开始前或未读取的时段", hourTx: "每小时交易（UTC）", hourUsd: "每小时 USDC 流动（UTC）", kinds: "按类型", top: "最繁忙的合约", cctp: "CCTP 跨链 — 按链", inn: "流入", out: "流出", whale: "最大一笔 USDC 流动", pblock: "最繁忙的区块", card: "保存报告卡", copy: "复制摘要", copied: "摘要已复制 — 粘贴即可发布", saved: "报告卡已保存", none: "还没有记录 — 采集器刚刚启动，几分钟后再来看看。", loading: "正在加载记录…", fail: "无法加载记录", tTx: "每日交易", tUsd: "每日 USDC 流动", tW: "每日活跃钱包", tFee: "每笔交易平均手续费", vsPrev: "较前一天", partial: "部分读取的日子", today: "今天（进行中）", noCctp: "当天没有 CCTP 流动", since: "记录开始：{d}", table: "表格视图", hour: "时", tps: "tx/s", txsPer: "交易", none2: "无", other: "其他" },
  tr: { title: "Arc günlük kayıtlar", day: "Gün", d7: "7 gün", d30: "30 gün", utc: "UTC", txs: "işlem", usd: "USDC hareketi", wallets: "aktif cüzdan (tahmini)", peak: "en yüksek işlem/sn (1 dk)", avg: "ortalama işlem/sn", ok: "başarılı", fee: "ödenen ücret (USDC)", feeAvg: "ortalama ücret", auth: "imzalı ödeme (EIP-3009)", born: "yeni kontrat", bIn: "CCTP ile gelen USDC", bOut: "CCTP ile giden USDC", cov: "Günün %{p}'i okundu", covFull: "Günün tamamı okundu", covNote: "Çizgili = kayıt başlamadan önceki ya da okunamayan saatler", hourTx: "Saatlik işlemler (UTC)", hourUsd: "Saatlik USDC hareketi (UTC)", kinds: "Türlere göre", top: "En yoğun kontratlar", cctp: "CCTP köprüsü — zincire göre", inn: "gelen", out: "giden", whale: "En büyük USDC hareketi", pblock: "En yoğun blok", card: "Rapor kartını kaydet", copy: "Özeti kopyala", copied: "Özet kopyalandı — yapıştırıp paylaşın", saved: "Rapor kartı kaydedildi", none: "Henüz kayıt yok — toplayıcı yeni başladı. Birkaç dakika sonra tekrar bakın.", loading: "Kayıtlar yükleniyor…", fail: "Kayıtlar yüklenemedi", tTx: "Günlük işlem", tUsd: "Günlük USDC hareketi", tW: "Günlük aktif cüzdan", tFee: "İşlem başına ortalama ücret", vsPrev: "önceki güne göre", partial: "kısmen okunan gün", today: "bugün (sürüyor)", noCctp: "Bu gün CCTP hareketi yok", since: "Kayıt başlangıcı: {d}", table: "Tablo", hour: "saat", tps: "tx/s", txsPer: "işlem", none2: "yok", other: "diğer" },
};
const EN = { title: "Arc daily records", day: "Day", d7: "7 days", d30: "30 days", utc: "UTC days", txs: "transactions", usd: "USDC moved", wallets: "active wallets (est.)", peak: "peak tx/s (1 min)", avg: "average tx/s", ok: "succeeded", fee: "fees paid (USDC)", feeAvg: "average fee", auth: "signed payments (EIP-3009)", born: "new contracts", bIn: "USDC in through CCTP", bOut: "USDC out through CCTP", cov: "{p}% of the day read", covFull: "The whole day read", covNote: "Striped = before the records began, or hours not read", hourTx: "Transactions by hour (UTC)", hourUsd: "USDC moved by hour (UTC)", kinds: "By kind", top: "Busiest contracts", cctp: "CCTP bridge — by chain", inn: "in", out: "out", whale: "Biggest USDC move", pblock: "Busiest block", card: "Save report card", copy: "Copy summary", copied: "Summary copied — paste it into your post", saved: "Report card saved", none: "No records yet — the collector has just started. Check back in a few minutes.", loading: "Loading the records…", fail: "Couldn't load the records", tTx: "Transactions a day", tUsd: "USDC moved a day", tW: "Active wallets a day", tFee: "Average fee per transaction", vsPrev: "vs the day before", partial: "partly read day", today: "today (so far)", noCctp: "No CCTP moves that day", since: "Records since {d}", table: "Table", hour: "hour", tps: "tx/s", txsPer: "transactions", none2: "none", other: "other" };

export function openDaily(ctx) {
  const { esc, fmtUsd, fmtN, KINDS, kcss, DOMAINS, EXPLORER, note, kindName } = ctx;
  const w = (k, v) => { const L = ctx.lang(); let s = (L !== "en" && W[L] && W[L][k]) || EN[k] || k; if (v) for (const [a, b] of Object.entries(v)) s = s.replace("{" + a + "}", b); return s; };
  const fee$ = (m) => m == null || !isFinite(m) ? "–" : m >= 1e8 ? fmtUsd(m / 1e4) : m >= 1e6 ? "$" + (m / 1e6).toFixed(2) : m >= 1e4 ? "$" + (m / 1e6).toFixed(3) : "$" + (m / 1e6).toFixed(4);
  const pct = (x) => x == null ? "–" : (x * 100).toFixed(x > 0.999 ? 2 : 1) + "%";
  const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
  const today = new Date().toISOString().slice(0, 10);
  let el = document.getElementById("gxd");
  if (el) { el.hidden = false; el.focus(); return; }
  el = document.createElement("div"); el.id = "gxd"; el.className = "gxd"; el.tabIndex = -1; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", w("title"));
  document.body.appendChild(el);
  const S = { tab: "day", list: null, d: null, one: new Map(), err: null };
  const close = () => { el.hidden = true; };
  el.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  el.addEventListener("click", (e) => { if (e.target === el) close(); });

  // ---------------------------------------------------------------- charts (SVG, one series each, a tooltip on hover)
  const tip = document.createElement("div"); tip.className = "gxd-tip"; tip.hidden = true;
  function hoverable(svg, rows) { // rows: [{ x0, x1, html }]
    const box = () => svg.getBoundingClientRect();
    const move = (cx, cy) => {
      const b = box(), vb = svg.viewBox.baseVal, x = (cx - b.left) / b.width * vb.width;
      const r = rows.find((q) => x >= q.x0 && x < q.x1);
      svg.querySelectorAll(".hv").forEach((n) => n.classList.toggle("on", !!r && +n.dataset.i === r.i));
      if (!r) { tip.hidden = true; return; }
      const pb = el.querySelector(".gxd-in").getBoundingClientRect();
      tip.innerHTML = r.html; tip.hidden = false;
      const tx = Math.min(pb.width - tip.offsetWidth - 8, Math.max(8, cx - pb.left + 12)), ty = Math.max(8, cy - pb.top - tip.offsetHeight - 10);
      tip.style.left = tx + "px"; tip.style.top = ty + "px";
    };
    svg.addEventListener("pointermove", (e) => move(e.clientX, e.clientY));
    svg.addEventListener("pointerdown", (e) => move(e.clientX, e.clientY));
    svg.addEventListener("pointerleave", () => { tip.hidden = true; svg.querySelectorAll(".hv.on").forEach((n) => n.classList.remove("on")); });
  }
  const niceMax = (m) => { if (!(m > 0)) return 1; const p = 10 ** Math.floor(Math.log10(m)), f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  // bars: vals[i] (null = no bar), part[i] = striped (not fully read); fmt for the axis + tooltip; labels[i] under the bars
  // the axis in short numbers (no cents): 250K · $5B · $0.02
  const axN = (v) => (v >= 1e9 ? +(v / 1e9).toFixed(1) + "B" : v >= 1e6 ? +(v / 1e6).toFixed(1) + "M" : v >= 1e3 ? +(v / 1e3).toFixed(1) + "K" : String(+v.toFixed(v < 1 ? 3 : 0)));
  const axUsd = (c) => "$" + axN(c / 100), axFee = (m) => "$" + axN(m / 1e6);
  function bars({ vals, part = [], labels = [], fmt = fmtN, ax = axN, tipOf, color = "var(--cyan)", h = 150, every = 1 }) {
    const phone = ctx.phone && innerWidth < 760; if (phone) { h = Math.round(h * 0.62); every = Math.max(every, Math.ceil(vals.length / 6)); }
    const n = vals.length, W0 = phone ? 400 : 720, pl = 46, pr = 6, pt = 10, pb = 22, iw = W0 - pl - pr, ih = h - pt - pb;
    const max = niceMax(Math.max(0, ...vals.filter((v) => v != null))), bw = iw / n, gap = Math.min(4, bw * 0.25);
    const y = (v) => pt + ih - (v / max) * ih;
    let g = "";
    for (const f of [0, 0.5, 1]) g += `<line x1="${pl}" x2="${W0 - pr}" y1="${y(max * f)}" y2="${y(max * f)}" class="gl"/><text x="${pl - 6}" y="${y(max * f) + 3.5}" class="ax" text-anchor="end">${esc(ax(max * f))}</text>`;
    const rows = [];
    vals.forEach((v, i) => {
      const x = pl + i * bw + gap / 2, ww = Math.max(1, bw - gap);
      if (v != null || !tipOf) rows.push({ x0: pl + i * bw, x1: pl + (i + 1) * bw, i, html: tipOf ? tipOf(i) : `${esc(labels[i] || "")}<b>${v == null ? "–" : esc(fmt(v))}</b>` });
      g += `<rect class="hv" data-i="${i}" x="${pl + i * bw}" y="${pt}" width="${bw}" height="${ih}" fill="transparent"/>`;
      if (v != null && v > 0) { const top = y(v), hh = pt + ih - top, r = Math.min(4, ww / 2, hh); g += `<path d="M${x},${pt + ih}V${top + r}q0,-${r} ${r},-${r}h${ww - 2 * r}q${r},0 ${r},${r}V${pt + ih}Z" fill="${part[i] ? "url(#gxd-hatch)" : color}" ${part[i] ? `stroke="${color}" stroke-width="1"` : ""} class="bar"/>`; }
      if (labels[i] != null && i % every === 0) g += `<text x="${pl + (i + 0.5) * bw}" y="${h - 6}" class="ax" text-anchor="middle">${esc(labels[i])}</text>`;
    });
    g += `<line x1="${pl}" x2="${W0 - pr}" y1="${pt + ih}" y2="${pt + ih}" class="base"/>`;
    const hatch = `<defs><pattern id="gxd-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(140,180,230,0.10)"/><line x1="0" y1="0" x2="0" y2="6" stroke="${color}" stroke-width="2" opacity="0.55"/></pattern></defs>`;
    const svg = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W0} ${h}" class="gxd-svg" role="img">${hatch}${g}</svg>`, "image/svg+xml").documentElement;
    const host = document.createElement("div"); host.className = "gxd-chart"; host.appendChild(document.importNode(svg, true));
    hoverable(host.firstChild, rows);
    return host;
  }

  // ---------------------------------------------------------------- data
  async function getList() {
    if (S.list) return S.list;
    const r = await fetch(API + "&days=30"); if (!r.ok) throw new Error(r.status);
    S.list = await r.json(); return S.list;
  }
  async function getOne(d) {
    if (S.one.has(d)) return S.one.get(d);
    const r = await fetch(API + "&d=" + d); if (r.status === 404) return null; if (!r.ok) throw new Error(r.status);
    const j = await r.json(); S.one.set(d, j); return j;
  }

  // ---------------------------------------------------------------- shell
  function shell(body) {
    const days = (S.list && S.list.days) || [], i = days.findIndex((x) => x.d === S.d);
    el.innerHTML = `<div class="gxd-in"><header><h2>📅 ${esc(w("title"))} <small>${esc(w("utc"))}</small></h2>
      <nav class="gxd-tabs">${[["day", "day"], ["d7", "d7"], ["d30", "d30"]].map(([k, l]) => `<button type="button" data-t="${k}" class="${S.tab === k ? "on" : ""}">${esc(w(l))}</button>`).join("")}</nav>
      <button type="button" class="gxd-x" aria-label="Close">×</button></header>
      ${S.tab === "day" && days.length ? `<div class="gxd-pick"><button type="button" data-dn="-1" ${i <= 0 ? "disabled" : ""} aria-label="Previous day">‹</button><select aria-label="Day">${days.map((x) => `<option value="${x.d}" ${x.d === S.d ? "selected" : ""}>${x.d}${x.d === today ? " · " + esc(w("today")) : ""}</option>`).join("")}</select><button type="button" data-dn="1" ${i >= days.length - 1 ? "disabled" : ""} aria-label="Next day">›</button></div>` : ""}
      <div class="gxd-body"></div></div>`;
    const b = el.querySelector(".gxd-body");
    if (typeof body === "string") b.innerHTML = body; else if (body) b.appendChild(body);
    el.querySelector(".gxd-in").appendChild(tip);
    el.querySelector(".gxd-x").onclick = close;
    el.querySelectorAll("[data-t]").forEach((x) => (x.onclick = () => { S.tab = x.dataset.t; paint(); }));
    const sel = el.querySelector(".gxd-pick select"); if (sel) sel.onchange = () => { S.d = sel.value; paint(); };
    el.querySelectorAll("[data-dn]").forEach((x) => (x.onclick = () => { const k = days.findIndex((q) => q.d === S.d) + +x.dataset.dn; if (days[k]) { S.d = days[k].d; paint(); } }));
    return b;
  }
  async function paint() {
    tip.hidden = true;
    try {
      if (!S.list) { shell(`<p class="gxd-msg">${esc(w("loading"))}</p>`); await getList(); }
      const days = S.list.days || [];
      if (!days.length) { shell(`<p class="gxd-msg">${esc(w("none"))}</p>`); return; }
      if (!S.d || !days.some((x) => x.d === S.d)) S.d = days[days.length - 1].d;
      if (S.tab === "day") { const one = await getOne(S.d); if (!one) { shell(`<p class="gxd-msg">${esc(w("none"))}</p>`); return; } paintDay(one); }
      else paintTrend(S.tab === "d7" ? 7 : 30);
    } catch { shell(`<p class="gxd-msg">${esc(w("fail"))}</p>`); }
  }

  // ---------------------------------------------------------------- one day
  function paintDay(o) {
    const frag = document.createElement("div");
    const okR = o.failRate == null ? null : 1 - o.failRate, feeAvg = o.feeTxs ? o.fee / o.feeTxs : null;
    const tiles = [
      ["txs", fmtN(o.txs), ""], ["usd", fmtUsd(o.usd), "gold"], ["wallets", "≈ " + fmtN(o.wallets), ""], ["peak", o.peakTps ? o.peakTps.toFixed(1) : "–", ""],
      ["avg", o.avgTps ? o.avgTps.toFixed(2) : "–", ""], ["ok", pct(okR), ""], ["fee", fee$(o.fee), ""], ["feeAvg", fee$(feeAvg), ""],
      ["auth", fmtN(o.auth), "agent"], ["born", fmtN(o.born), ""], ["bIn", fmtUsd(o.bridgeIn || 0), ""], ["bOut", fmtUsd(o.bridgeOut || 0), ""],
    ];
    const cov = Math.round((o.cov || 0) * 1000) / 10;
    frag.innerHTML = `<p class="gxd-cov ${cov >= 99 ? "full" : ""}">${esc(cov >= 99 ? w("covFull") : w("cov", { p: cov }))}${o.d === today ? " · " + esc(w("today")) : ""}</p>
      <div class="gxd-tiles">${tiles.map(([k, v, c]) => `<div class="gxd-t ${c}"><b>${esc(v)}</b><span>${esc(w(k))}</span></div>`).join("")}</div>
      <div class="gxd-acts"><button type="button" class="pri" data-a="card">🖼 ${esc(w("card"))}</button><button type="button" data-a="copy">📋 ${esc(w("copy"))}</button></div>
      <section><h3>${esc(w("hourTx"))}</h3><div data-c="htx"></div></section>
      <section><h3>${esc(w("hourUsd"))}</h3><div data-c="husd"></div></section>
      <p class="gxd-foot">${esc(w("covNote"))}</p>
      <section><h3>${esc(w("kinds"))}</h3><div data-c="kinds"></div></section>
      <div class="gxd-two"><section><h3>${esc(w("top"))}</h3><ol class="gxd-top" data-c="top"></ol></section>
      <section><h3>${esc(w("cctp"))}</h3><div data-c="cctp"></div></section></div>
      <dl class="gxd-rec">${o.whale ? `<dt>${esc(w("whale"))}</dt><dd><a href="${EXPLORER}/tx/${o.whale[1]}" target="_blank" rel="noopener">${esc(fmtUsd(o.whale[0]))} · ${new Date(o.whale[2]).toISOString().slice(11, 16)} UTC ↗</a></dd>` : ""}${o.peakBlock ? `<dt>${esc(w("pblock"))}</dt><dd><a href="${EXPLORER}/block/${o.peakBlock[1]}" target="_blank" rel="noopener">#${Number(o.peakBlock[1]).toLocaleString("en-US")} · ${o.peakBlock[0]} ${esc(w("txsPer"))} ↗</a></dd>` : ""}</dl>`;
    const b = shell(frag);
    // hours: striped when the hour wasn't fully read
    const hasB = (o.hB || []).some((x) => x > 0), cur = o.d === today ? new Date().getUTCHours() : 24;
    const part = Array.from({ length: 24 }, (_, h) => h <= cur && (hasB ? (o.hB[h] || 0) < 6800 : !(o.hTx[h] > 0)));
    const vals = (arr) => arr.map((v, h) => (h > cur ? null : v));
    const hl = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
    const tipH = (h) => `${hl[h]}:00–${hl[h]}:59 UTC<b>${fmtN(o.hTx[h])} ${esc(w("txsPer"))}</b>${esc(fmtUsd(o.hUsd[h]))} USDC${o.hFail && o.hFail[h] ? ` · ${o.hFail[h]} ✕` : ""}${part[h] ? `<em>${esc(w("partial"))}</em>` : ""}`;
    b.querySelector('[data-c="htx"]').appendChild(bars({ vals: vals(o.hTx), part, labels: hl, every: 3, tipOf: tipH }));
    b.querySelector('[data-c="husd"]').appendChild(bars({ vals: vals(o.hUsd), part, labels: hl, every: 3, color: "var(--gold)", fmt: (v) => fmtUsd(v), ax: axUsd, tipOf: tipH }));
    // kinds: one stacked bar (2px gaps) + a legend with counts
    const tot = o.kinds.reduce((s, v) => s + v, 0) || 1;
    const segs = KINDS.map((k, i) => [i, o.kinds[i] || 0]).filter((x) => x[1] > 0).sort((a, c) => c[1] - a[1]);
    b.querySelector('[data-c="kinds"]').innerHTML = `<div class="gxd-stack">${segs.map(([i, v]) => `<i style="flex:${v};background:${kcss(i)}" title="${esc(kindName(i))} ${fmtN(v)}"></i>`).join("")}</div>
      <ul class="gxd-leg">${segs.map(([i, v]) => `<li><i style="background:${kcss(i)}"></i>${esc(kindName(i))}<em>${fmtN(v)} · ${(v / tot * 100).toFixed(1)}%</em></li>`).join("")}</ul>`;
    // top contracts
    const tmax = o.top.length ? o.top[0][1] : 1;
    b.querySelector('[data-c="top"]').innerHTML = o.top.slice(0, 10).map(([a, n]) => { const L = o.labels && o.labels[a]; return `<li><a href="${EXPLORER}/address/${a}" target="_blank" rel="noopener"><span>${esc(L ? L[0] : short(a))}</span><em>${fmtN(n)}</em></a><i style="width:${Math.max(2, n / tmax * 100)}%"></i></li>`; }).join("") || `<li class="gxd-msg">${esc(w("none2"))}</li>`;
    // CCTP by chain
    const dn = (k) => (DOMAINS[k] ? DOMAINS[k][0] : "Domain " + k);
    const ids = [...new Set([...Object.keys(o.cIn || {}), ...Object.keys(o.cOut || {})])].sort((a, c) => ((o.cIn[c] || 0) + (o.cOut[c] || 0)) - ((o.cIn[a] || 0) + (o.cOut[a] || 0)));
    b.querySelector('[data-c="cctp"]').innerHTML = ids.length ? `<table class="gxd-tbl"><thead><tr><th></th><th>${esc(w("inn"))} →</th><th>← ${esc(w("out"))}</th></tr></thead><tbody>${ids.slice(0, 10).map((k) => `<tr><td>${esc(dn(k))}</td><td>${o.cIn[k] ? esc(fmtUsd(o.cIn[k])) : "–"}</td><td>${o.cOut[k] ? esc(fmtUsd(o.cOut[k])) : "–"}</td></tr>`).join("")}</tbody></table>` : `<p class="gxd-msg">${esc(w("noCctp"))}</p>`;
    b.querySelector('[data-a="copy"]').onclick = () => copySummary(o);
    b.querySelector('[data-a="card"]').onclick = () => reportCard(o).catch(() => note(w("fail")));
  }

  // ---------------------------------------------------------------- trends
  function paintTrend(n) {
    const by = new Map((S.list.days || []).map((x) => [x.d, x]));
    const now = Date.now(), ds = Array.from({ length: n }, (_, i) => new Date(now - (n - 1 - i) * 864e5).toISOString().slice(0, 10));
    const rows = ds.map((d) => by.get(d) || null);
    const lab = ds.map((d) => d.slice(5).replace("-", "/"));
    const part = rows.map((r, i) => !!r && (r.cov < 0.95 || ds[i] === today));
    const frag = document.createElement("div");
    const defs = [
      ["tTx", (r) => r.txs, fmtN, "var(--cyan)"],
      ["tUsd", (r) => r.usd, (v) => fmtUsd(v), "var(--gold)", axUsd],
      ["tW", (r) => r.wallets, fmtN, "var(--mint)"],
      ["tFee", (r) => (r.feeTxs ? r.fee / r.feeTxs : null), fee$, "#a98bff", axFee],
    ];
    frag.innerHTML = `<p class="gxd-foot">${esc(w("covNote"))}${S.list.days.length ? " · " + esc(w("since", { d: S.list.days[0].d })) : ""}</p>` + defs.map(([k], i) => `<section class="gxd-tr"><h3>${esc(w(k))} <span class="gxd-delta" data-dl="${i}"></span></h3><div data-c="t${i}"></div></section>`).join("");
    const b = shell(frag);
    defs.forEach(([k, get, fmt, color, ax = axN], i) => {
      const vals = rows.map((r) => (r ? get(r) : null));
      b.querySelector(`[data-c="t${i}"]`).appendChild(bars({ vals, part, labels: lab, every: n > 10 ? 5 : 1, fmt, ax, color, h: 130, tipOf: (j) => `${ds[j]}<b>${vals[j] == null ? "–" : esc(fmt(vals[j]))}</b>${rows[j] ? esc(w("cov", { p: Math.round(rows[j].cov * 1000) / 10 })) : ""}${part[j] ? `<em>${esc(ds[j] === today ? w("today") : w("partial"))}</em>` : ""}` }));
      // the change between the last two days read in full (partial days aren't comparable)
      const full = rows.map((r, j) => (r && !part[j] ? [j, get(r)] : null)).filter((x) => x && x[1] != null);
      const dl = b.querySelector(`[data-dl="${i}"]`);
      if (full.length >= 2) { const [a, c] = [full[full.length - 2][1], full[full.length - 1][1]]; if (a > 0) { const ch = (c - a) / a; dl.textContent = `${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch * 100).toFixed(1)}% ${w("vsPrev")}`; dl.className = "gxd-delta " + (ch >= 0 ? "up" : "dn"); } }
    });
  }

  // ---------------------------------------------------------------- summary text + report card (the viewer posts them)
  function summaryText(o) {
    const okR = o.failRate == null ? null : 1 - o.failRate, feeAvg = o.feeTxs ? o.fee / o.feeTxs : null;
    const cov = Math.round((o.cov || 0) * 100);
    return [
      `🌌 Arc on ${o.d} (UTC)${cov < 99 ? ` — ${cov}% of the day read` : ""}`, "",
      `• ${fmtN(o.txs)} transactions · peak ${o.peakTps ? o.peakTps.toFixed(1) : "–"} tx/s`,
      `• ${fmtUsd(o.usd)} USDC moved`,
      `• ≈ ${fmtN(o.wallets)} active wallets`,
      `• ${pct(okR)} succeeded · avg fee ${fee$(feeAvg)}`,
      o.born ? `• ${fmtN(o.born)} new contracts` : null,
      o.bridgeIn || o.bridgeOut ? `• CCTP: ${[o.bridgeIn ? fmtUsd(o.bridgeIn) + " in" : "", o.bridgeOut ? fmtUsd(o.bridgeOut) + " out" : ""].filter(Boolean).join(" · ")}` : null,
      o.auth ? `• ${fmtN(o.auth)} signed USDC payments (EIP-3009)` : null,
      "", "Seen live by ARC GALAXY 👉 arcircle.app/galaxy",
    ].filter((x) => x != null).join("\n");
  }
  async function copySummary(o) {
    const s = summaryText(o);
    try { await navigator.clipboard.writeText(s); note(w("copied")); }
    catch { const ta = document.createElement("textarea"); ta.value = s; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); note(w("copied")); } catch {} ta.remove(); }
  }
  const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  async function reportCard(o) {
    const c = document.createElement("canvas"); c.width = 1200; c.height = 675; const x = c.getContext("2d");
    await (document.fonts && document.fonts.ready);
    x.fillStyle = "#03060f"; x.fillRect(0, 0, 1200, 675);
    const bg = await loadImg("/images/galaxy/key-wide.webp");
    if (bg) { x.globalAlpha = 0.35; const s = Math.max(1200 / bg.width, 675 / bg.height); x.drawImage(bg, (1200 - bg.width * s) / 2, (675 - bg.height * s) / 2, bg.width * s, bg.height * s); x.globalAlpha = 1; }
    const gr = x.createLinearGradient(0, 0, 0, 675); gr.addColorStop(0, "rgba(3,6,15,0.55)"); gr.addColorStop(1, "rgba(3,6,15,0.92)"); x.fillStyle = gr; x.fillRect(0, 0, 1200, 675);
    const F = (wt, sz, fam = "Sora") => `${wt} ${sz}px ${fam}, system-ui, sans-serif`;
    x.textBaseline = "alphabetic";
    x.fillStyle = "#3ce6ff"; x.font = F(800, 34, "'Exo 2'"); x.fillText("ARC", 56, 76); const aw = x.measureText("ARC ").width;
    x.fillStyle = "#eaf4ff"; x.fillText("GALAXY", 56 + aw, 76);
    x.fillStyle = "#8fa6c8"; x.font = F(600, 18); x.fillText("DAILY REPORT", 56, 104);
    x.textAlign = "right"; x.fillStyle = "#eaf4ff"; x.font = F(800, 40, "'Exo 2'"); x.fillText(o.d, 1144, 78);
    const cov = Math.round((o.cov || 0) * 100); x.fillStyle = "#8fa6c8"; x.font = F(500, 16); x.fillText(cov >= 99 ? "UTC · the whole day" : `UTC · ${cov}% of the day read`, 1144, 104); x.textAlign = "left";
    const okR = o.failRate == null ? null : 1 - o.failRate, feeAvg = o.feeTxs ? o.fee / o.feeTxs : null;
    const T = [[fmtN(o.txs), "transactions", "#eaf4ff"], [fmtUsd(o.usd), "USDC moved", "#ffd166"], ["≈ " + fmtN(o.wallets), "active wallets", "#4dffb0"],
      [o.peakTps ? o.peakTps.toFixed(1) : "–", "peak tx/s (1 min)", "#3ce6ff"], [pct(okR), "succeeded", "#eaf4ff"], [fee$(feeAvg), "average fee", "#eaf4ff"]];
    T.forEach(([v, l, col], i) => {
      const cx = 56 + (i % 3) * 368, cy = 150 + Math.floor(i / 3) * 128;
      x.fillStyle = "rgba(10,22,48,0.72)"; x.strokeStyle = "rgba(120,220,255,0.28)"; x.lineWidth = 1.5; x.beginPath(); x.roundRect(cx, cy, 344, 108, 16); x.fill(); x.stroke();
      x.fillStyle = col; x.font = F(800, 46, "'Exo 2'"); x.fillText(v, cx + 22, cy + 60);
      x.fillStyle = "#8fa6c8"; x.font = F(500, 17); x.fillText(l, cx + 22, cy + 88);
    });
    // the hours
    const top0 = 420, hh = 150, bw = 1088 / 24, mx = Math.max(1, ...o.hTx);
    x.fillStyle = "#8fa6c8"; x.font = F(600, 15); x.fillText("Transactions by hour (UTC)", 56, top0 - 10);
    o.hTx.forEach((v, h) => { const bh = (v / mx) * (hh - 26); if (bh > 0) { x.fillStyle = "#3ce6ff"; x.beginPath(); x.roundRect(56 + h * bw + 3, top0 + hh - 26 - bh, bw - 6, bh, [4, 4, 0, 0]); x.fill(); } if (h % 3 === 0) { x.fillStyle = "#8fa6c8"; x.font = F(500, 13, "'JetBrains Mono'"); x.fillText(String(h).padStart(2, "0"), 56 + h * bw + 6, top0 + hh - 6); } });
    x.strokeStyle = "rgba(143,166,200,0.35)"; x.beginPath(); x.moveTo(56, top0 + hh - 26); x.lineTo(1144, top0 + hh - 26); x.stroke();
    // footer
    const extra = [o.born ? `${fmtN(o.born)} new contracts` : null, o.bridgeIn ? `${fmtUsd(o.bridgeIn)} in through CCTP` : null, o.whale ? `biggest move ${fmtUsd(o.whale[0])}` : null].filter(Boolean).join("  ·  ");
    x.fillStyle = "#eaf4ff"; x.font = F(600, 17); x.fillText(extra, 56, 616);
    x.fillStyle = "#8fa6c8"; x.font = F(500, 15); x.fillText("arcircle.app/galaxy  ·  community-built by ARCIRCLE  ·  data: Arc's public RPC", 56, 646);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
    const file = new File([blob], `arc-daily-${o.d}.png`, { type: "image/png" });
    if (ctx.phone && navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text: summaryText(o) }); return; } catch { /* fall back to a download */ } }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    note(w("saved"));
  }

  paint();
  el.focus();
  return { paint, close, state: S };
}
