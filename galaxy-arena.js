// galaxy-arena.js — CHAIN ARENA (arcircle.app/galaxy/arena, GXA): Arc, Robinhood Chain and Solana side by side, live.
// Reads /api/social?arc=arena (api/_chain-arena.mjs) every 10 s. ?src=<same-origin path> reads a saved answer (tests).
const Q = new URLSearchParams(location.search);
const API = (() => { const s = Q.get("src"); return s && /^\/[\w\-./?=&]+$/.test(s) ? s : "/api/social?arc=arena"; })();
const CH = [
  { id: "arc", name: "Arc", col: "#1d9fcf", glow: "#3ce6ff", by: "Circle", money: "USDC" },
  { id: "rh", name: "Robinhood Chain", short: "Robinhood", col: "#7a9f00", glow: "#ccff00", by: "Robinhood", money: "ETH + USDG" },
  { id: "sol", name: "Solana", col: "#9468ff", glow: "#b69cff", by: "Solana", money: "USDC" },
];
const W = {
  ko: { back: "‹ ARC GALAXY", connecting: "연결 중…", live: "LIVE", ago: "{s}초 전 갱신", tag: "Arc vs Robinhood Chain vs Solana — 각 체인의 공개 RPC에서 실시간으로 측정합니다.", finality: "완결성 — 트랜잭션은 언제 확정될까?", how: "측정 방법", note: "실시간 수치는 분 단위 트래픽에 따라 움직여요 — 조용한 1분이 느린 체인을 뜻하진 않아요. ARCIRCLE 커뮤니티 제작; Arc·Circle·Robinhood·Solana의 공식 사이트가 아닙니다.", copy: "📋 요약 복사", open: "🌌 ARC GALAXY 열기", openRh: "Robinhood Chain 갤럭시", tps: "초당 트랜잭션", tpsSub: "사용자 트랜잭션 (Solana는 검증자 투표 제외)", bt: "블록 시간", btSub: "블록(슬롯) 하나에 걸리는 초", fee: "평균 수수료", feeSub: "트랜잭션 1건당 달러", usd: "1분간 이동한 가치", usdSub: "달러 기준", fail: "실패율", failSub: "실패한 트랜잭션 비율", wal: "활동 지갑 · 10분", walSub: "보낸 주소 수 (모든 블록을 읽는 EVM만)", lower: "낮을수록 좋음", higher: "높을수록 많음", best: "최고", na: "측정 안 됨", down: "지금은 읽을 수 없어요", copied: "요약을 복사했어요", sampled: "샘플 블록 {n}개 기준", arcFin: "결정적 완결 — 블록에 들어가면 바로 최종 (되돌림 없음)", rhFin: "Arbitrum Orbit 기반 — 시퀀서가 즉시 확인, 이후 부모 체인에 배치가 기록되며 최종", solFin: "낙관적 확인은 빠르고, ‘finalized’는 32슬롯 뒤 (약 13초)", basisArc: "Arc 공개 RPC로 최근 10분의 모든 블록과 영수증을 읽어요. USDC가 기본 코인이라 이동액·수수료를 그대로 달러로 셉니다.", basisRh: "Robinhood Chain 공개 RPC로 최근 10분의 모든 블록과 영수증을 읽어요. 블록마다 있는 ArbOS 시스템 트랜잭션은 빼고, 가치는 ETH(실시간 가격)와 그곳의 달러 USDG를 더해 셉니다.", basisSol: "클러스터의 getRecentPerformanceSamples로 초당 트랜잭션(투표 제외)과 슬롯 시간을 읽고, 20초마다 최근 블록 하나를 통째로 읽어 수수료·실패율·USDC 이동(토큰 잔액 변화)을 추정합니다.", perMin: "/분" },
  zh: { back: "‹ ARC GALAXY", connecting: "连接中…", live: "LIVE", ago: "{s} 秒前更新", tag: "Arc vs Robinhood Chain vs Solana — 各自从公开 RPC 实时测量。", finality: "最终性 — 交易何时不可逆？", how: "测量方法", note: "实时数据随每分钟的流量变化 — 安静的一分钟不代表链慢。由 ARCIRCLE 社区制作；非 Arc、Circle、Robinhood 或 Solana 官方网站。", copy: "📋 复制摘要", open: "🌌 打开 ARC GALAXY", openRh: "Robinhood Chain 星系", tps: "每秒交易", tpsSub: "用户交易（Solana 不含验证者投票）", bt: "出块时间", btSub: "每个区块（slot）的秒数", fee: "平均手续费", feeSub: "每笔交易（美元）", usd: "每分钟转移价值", usdSub: "美元计", fail: "失败率", failSub: "失败交易占比", wal: "活跃钱包 · 10 分钟", walSub: "发送地址数（仅读取全部区块的 EVM）", lower: "越低越好", higher: "越高越多", best: "最佳", na: "未测量", down: "暂时无法读取", copied: "摘要已复制", sampled: "基于 {n} 个抽样区块", arcFin: "确定性最终 — 进入区块即最终（无重组）", rhFin: "基于 Arbitrum Orbit — 排序器即时确认，批次写入父链后最终", solFin: "乐观确认很快，“finalized” 需 32 个 slot（约 13 秒）", basisArc: "通过 Arc 公开 RPC 读取最近 10 分钟的全部区块与回执。USDC 是原生币，金额与手续费直接按美元计。", basisRh: "通过 Robinhood Chain 公开 RPC 读取最近 10 分钟的全部区块与回执。排除每个区块的 ArbOS 系统交易，价值 = ETH（实时价格）加上链上流通的美元 USDG。", basisSol: "用集群的 getRecentPerformanceSamples 读取每秒交易（不含投票）与 slot 时间，并每 20 秒完整读取一个最近区块来估算手续费、失败率和 USDC 转移（代币余额变化）。", perMin: "/分钟" },
  tr: { back: "‹ ARC GALAXY", connecting: "Bağlanıyor…", live: "CANLI", ago: "{s} sn önce", tag: "Arc vs Robinhood Chain vs Solana — her biri kendi açık RPC'sinden canlı ölçülür.", finality: "Kesinlik — işlem ne zaman kesinleşir?", how: "Nasıl ölçüyoruz", note: "Canlı sayılar dakikalık trafikle değişir — sakin bir dakika yavaş zincir demek değildir. ARCIRCLE topluluğu yaptı; Arc, Circle, Robinhood ya da Solana'nın resmi sitesi değildir.", copy: "📋 Özeti kopyala", open: "🌌 ARC GALAXY'yi aç", openRh: "Robinhood Chain galaksisi", tps: "işlem / saniye", tpsSub: "kullanıcı işlemleri (Solana: doğrulayıcı oyları hariç)", bt: "blok süresi", btSub: "bir blok (slot) için saniye", fee: "ortalama ücret", feeSub: "işlem başına dolar", usd: "dakikada taşınan değer", usdSub: "dolar", fail: "başarısız", failSub: "başarısız işlem oranı", wal: "aktif cüzdan · 10 dk", walSub: "gönderen adres (yalnızca her bloğu okuyan EVM)", lower: "düşük daha iyi", higher: "yüksek daha çok", best: "en iyi", na: "ölçülmedi", down: "şu an okunamıyor", copied: "Özet kopyalandı", sampled: "{n} örnek bloğa göre", arcFin: "Deterministik kesinlik — bloğa girince kesin (geri alma yok)", rhFin: "Arbitrum Orbit — sıralayıcı anında onaylar, parti üst zincire yazılınca kesinleşir", solFin: "İyimser onay hızlı, “finalized” 32 slot sonra (~13 sn)", basisArc: "Arc açık RPC'sinden son 10 dakikanın her bloğu ve makbuzu okunur. USDC yerel coin olduğundan tutar ve ücretler doğrudan dolardır.", basisRh: "Robinhood Chain açık RPC'sinden son 10 dakikanın her bloğu ve makbuzu okunur. Her bloktaki ArbOS sistem işlemi çıkarılır; değer = canlı fiyatla ETH + oradaki dolar USDG.", basisSol: "Kümenin getRecentPerformanceSamples verisiyle işlem/sn (oylar hariç) ve slot süresi okunur; her 20 sn'de bir son blok tamamen okunarak ücret, başarısızlık ve USDC hareketi (token bakiye değişimi) tahmin edilir.", perMin: "/dk" },
};
const EN = { back: "‹ ARC GALAXY", connecting: "Connecting…", live: "LIVE", ago: "updated {s}s ago", tag: "Arc vs Robinhood Chain vs Solana — measured live, each from its own public RPC.", finality: "Finality — when is a transaction final?", how: "How we measure", note: "Live numbers move with each chain's traffic minute by minute — a quiet minute isn't a slow chain. Community-built by ARCIRCLE; not an official site of Arc, Circle, Robinhood or Solana.", copy: "📋 Copy summary", open: "🌌 Open ARC GALAXY", openRh: "Robinhood Chain galaxy", tps: "Transactions a second", tpsSub: "user transactions (Solana: without validator votes)", bt: "Block time", btSub: "seconds a block (a slot on Solana)", fee: "Average fee", feeSub: "dollars a transaction", usd: "Value moved a minute", usdSub: "in dollars", fail: "Failed", failSub: "share of transactions that failed", wal: "Active wallets · 10 min", walSub: "distinct senders (EVM chains, every block read)", lower: "lower is better", higher: "higher is more", best: "best", na: "not measured", down: "can't be read right now", copied: "Summary copied", sampled: "from {n} sampled blocks", arcFin: "Deterministic — final as soon as it's in a block (no reorgs)", rhFin: "Arbitrum Orbit — the sequencer confirms at once; final once its batch is posted to the parent chain", solFin: "Optimistic confirmation is quick; 'finalized' after 32 slots (≈ 13 s)", basisArc: "Arc's public RPC: every block and receipt of the last 10 minutes. USDC is the native coin, so value and fees are dollars as they are.", basisRh: "Robinhood Chain's public RPC: every block and receipt of the last 10 minutes. The ArbOS system transaction each block carries is left out; value is ETH at its live price plus USDG, the dollar that moves there.", basisSol: "The cluster's getRecentPerformanceSamples for tx/s (votes aren't counted as transactions there) and slot time; every 20 s one recent block read in full for fees, failures and USDC moved (token balance changes) — estimates.", perMin: "/min" };
let LANG = (() => { try { const s = localStorage.getItem("arc.galaxy.lang") || localStorage.getItem("arcircle.lang"); if (s && (s === "en" || W[s])) return s; } catch {} const n = (navigator.language || "en").slice(0, 2); return W[n] ? n : "en"; })();
const t = (k, v) => { let s = (LANG !== "en" && W[LANG] && W[LANG][k]) || EN[k] || k; if (v) for (const [a, b] of Object.entries(v)) s = s.replace("{" + a + "}", b); return s; };
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const usd = (d) => d == null ? "–" : d >= 1e9 ? "$" + (d / 1e9).toFixed(2) + "B" : d >= 1e6 ? "$" + (d / 1e6).toFixed(2) + "M" : d >= 1e4 ? "$" + (d / 1e3).toFixed(1) + "K" : d >= 100 ? "$" + Math.round(d).toLocaleString("en-US") : "$" + d.toFixed(2);
const fee = (d) => d == null ? "–" : d >= 1 ? "$" + d.toFixed(2) : d >= 0.01 ? "$" + d.toFixed(3) : d >= 0.0001 ? "$" + d.toFixed(4) : "$" + d.toPrecision(2);
const num = (n, dp = 1) => n == null ? "–" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(dp);
const pct = (x) => x == null ? "–" : (x * 100).toFixed(x < 0.001 ? 2 : 1) + "%";
const secs = (s) => s == null ? "–" : s < 1 ? Math.round(s * 1000) + " ms" : s.toFixed(2) + " s";

const METRICS = [
  { k: "tps", get: (c) => c.tps, fmt: (v) => num(v, 2), best: "max", sub: "tpsSub" },
  { k: "bt", get: (c) => c.blockTime, fmt: secs, best: "min", sub: "btSub" },
  { k: "fee", get: (c) => c.feeUsd, fmt: fee, best: "min", sub: "feeSub", log: true },
  { k: "usd", get: (c) => c.usdMin, fmt: (v) => usd(v) + t("perMin"), best: "max", sub: "usdSub", log: true },
  { k: "fail", get: (c) => c.failRate, fmt: pct, best: "min", sub: "failSub" },
  { k: "wal", get: (c) => c.wallets, fmt: (v) => num(v, 0), best: "max", sub: "walSub" },
];
let data = null, at = 0;
function paintWords() {
  document.documentElement.lang = LANG; $("ga-lang").value = LANG;
  document.querySelectorAll("[data-i]").forEach((el) => { const k = el.dataset.i; if (!el.dataset.en) el.dataset.en = el.textContent; el.textContent = LANG === "en" ? el.dataset.en : t(k); });
  paint();
}
function paint() {
  const C = data && data.chains || {};
  // the three cards: the headline number (tx/s) + block time + fee
  $("ga-cards").innerHTML = CH.map((ch) => {
    const c = C[ch.id] || {}, bad = !c || c.error;
    return `<article class="ga-card" style="--c:${ch.col};--g:${ch.glow}"><header><i></i><h2>${esc(ch.name)}</h2>${c.stale ? `<em>stale</em>` : ""}</header>
      ${bad ? `<p class="ga-down">${esc(t("down"))}</p>` : `<b class="ga-big">${esc(num(c.tps, 2))}</b><span class="ga-u">${esc(t("tps"))}</span>
      <dl><dt>${esc(t("bt"))}</dt><dd>${esc(secs(c.blockTime))}</dd><dt>${esc(t("fee"))}</dt><dd>${esc(fee(c.feeUsd))}</dd><dt>${esc(t("usd"))}</dt><dd>${esc(c.usdMin == null ? "–" : usd(c.usdMin) + t("perMin"))}</dd></dl>`}
      ${ch.id === "sol" && c.sampled ? `<small>${esc(t("sampled", { n: c.sampled }))}</small>` : ""}</article>`;
  }).join("");
  // metric rows: one bar a chain, the best one marked (only when two or more were measured)
  $("ga-rows").innerHTML = METRICS.map((m) => {
    const vals = CH.map((ch) => { const c = C[ch.id]; const v = c && !c.error ? m.get(c) : null; return v == null || !isFinite(v) ? null : v; });
    const have = vals.filter((v) => v != null);
    const f = (v) => (m.log ? Math.log10(1 + v * (m.k === "fee" ? 1e5 : 1)) : v);
    const max = Math.max(1e-12, ...have.map(f));
    const bestV = have.length >= 2 ? (m.best === "max" ? Math.max(...have) : Math.min(...have)) : null;
    return `<section class="ga-row"><h3>${esc(t(m.k))} <small>${esc(t(m.sub))} · ${esc(t(m.best === "max" ? "higher" : "lower"))}${m.log ? " · log" : ""}</small></h3>
      ${CH.map((ch, i) => { const v = vals[i], w = v == null ? 0 : Math.max(1.5, (f(v) / max) * 100); return `<div class="ga-bar" style="--c:${ch.col};--g:${ch.glow}" title="${esc(ch.name)}: ${v == null ? esc(t("na")) : esc(m.fmt(v))}"><span class="n"><span class="f">${esc(ch.name)}</span><span class="s">${esc(ch.short || ch.name)}</span></span><span class="t"><i style="width:${w}%"></i></span><b>${v == null ? `<em>${esc(t("na"))}</em>` : esc(m.fmt(v))}${v != null && v === bestV ? ` <u>👑 ${esc(t("best"))}</u>` : ""}</b></div>`; }).join("")}</section>`;
  }).join("");
  $("ga-fin").innerHTML = CH.map((ch) => `<div class="ga-f" style="--c:${ch.col}"><b>${esc(ch.name)}</b><span>${esc(t(ch.id + "Fin"))}</span></div>`).join("");
  $("ga-basis").innerHTML = CH.map((ch) => `<p style="--c:${ch.col}"><b>${esc(ch.name)}</b> ${esc(t("basis" + ch.id[0].toUpperCase() + ch.id.slice(1)))}</p>`).join("");
}
function tick() { const live = $("ga-live"); if (!at) return; const s = Math.max(0, Math.round((Date.now() - at) / 1000)); live.classList.toggle("on", s < 40); $("ga-live-t").textContent = `${t("live")} · ${t("ago", { s })}`; }
async function load() {
  try { const r = await fetch(API, { cache: "no-store" }); if (!r.ok) throw new Error(r.status); data = await r.json(); at = Date.now(); paint(); tick(); }
  catch { if (!data) $("ga-live-t").textContent = t("down"); }
}
function summary() {
  const C = (data && data.chains) || {};
  const line = (ch) => { const c = C[ch.id]; if (!c || c.error) return `${ch.name}: —`; return `${ch.name}: ${num(c.tps, 1)} tx/s · ${secs(c.blockTime)} blocks · avg fee ${fee(c.feeUsd)}${c.usdMin != null ? ` · ${usd(c.usdMin)}/min moved` : ""}`; };
  return ["⚔️ CHAIN ARENA — live right now", "", ...CH.map(line), "", "Measured from each chain's public RPC 👉 arcircle.app/galaxy/arena"].join("\n");
}
$("ga-copy").addEventListener("click", async () => { const s = summary(); try { await navigator.clipboard.writeText(s); } catch { const a = document.createElement("textarea"); a.value = s; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); } catch {} a.remove(); } const n = $("ga-toast"); n.textContent = t("copied"); n.hidden = false; setTimeout(() => (n.hidden = true), 2500); });
$("ga-lang").addEventListener("change", (e) => { LANG = e.target.value; try { localStorage.setItem("arc.galaxy.lang", LANG); } catch {} paintWords(); });
paintWords(); load();
setInterval(() => { if (!document.hidden) load(); }, 10000);
setInterval(tick, 1000);
window.__arena = { summary, get data() { return data; } };
