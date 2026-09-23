/* global ethers, ACT, APC, state, readProvider, ERC20_ABI, CONFIG, actPaint, apcRenderChart, ac2RenderChart, renderHeader */
// arc-motion.js — the finishing layer on ArcPad / CirclePad / Reward:
//   • numbers count up to their new value (home stats)
//   • cards and sections ease in as they scroll into view
//   • price charts draw themselves the first time a coin opens
//   • a rocket for the launch: idles while the wallet confirms, lifts off
//     when the coin is live
//   • dock icons bounce on tap
//   • richer wallet menu: USDC (gas) and $ARCIRCLE balances, copy feedback,
//     Portfolio link, "add $ARCIRCLE to wallet"
// Everything respects prefers-reduced-motion.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) document.documentElement.classList.add("rm");
  const usd = (n) => {
    if (n == null || !isFinite(n)) return "—";
    if (n >= 1000) return "$" + Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
    if (n >= 1) return "$" + n.toFixed(2);
    return n === 0 ? "$0" : "$" + n.toPrecision(2);
  };

  // ================= count-up =================
  function countUp(el, to, fmt = (v) => String(Math.round(v)), ms = 900) {
    if (!el) return;
    const from = el.__cu != null ? el.__cu : 0;
    el.__cu = to;
    const put = (v) => { el.__last = fmt(v); el.textContent = el.__last; };
    if (reduce || !isFinite(from) || from === to) { put(to); return; }
    const t0 = performance.now();
    cancelAnimationFrame(el.__raf);
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      put(from + (to - from) * e);
      if (k < 1) el.__raf = requestAnimationFrame(step);
    };
    el.__raf = requestAnimationFrame(step);
  }
  window.arcCountUp = countUp;
  // Launch count: arcpad.js writes the plain number — animate from 0 to it.
  const cnt = $("ap-stat-count");
  if (cnt) new MutationObserver(() => {
    if (cnt.textContent === cnt.__last) return; // our own animation frames
    const n = Number(cnt.textContent.replace(/[^\d.]/g, ""));
    if (cnt.textContent.trim() && isFinite(n) && /^\d+$/.test(cnt.textContent.trim())) countUp(cnt, n);
  }).observe(cnt, { childList: true, characterData: true, subtree: true });
  // 24h volume across all ArcPad pools, from the activity scan.
  const vol = $("ap-stat-vol");
  if (vol && typeof actPaint === "function") {
    const orig = actPaint;
    // eslint-disable-next-line no-global-assign
    actPaint = function () {
      orig();
      try {
        if (typeof ACT !== "undefined" && ACT.hi != null) {
          let v = 0; ACT.stats.forEach((s) => { v += s.vol || 0; });
          countUp(vol, v, usd);
        }
      } catch (e) { console.warn(e); }
    };
  }

  // ================= scroll reveal =================
  const REVEAL = [".bp-card", ".ac2-card:not(.ac2-swap)", ".pf-launch", ".bp-mini-stat", ".ap-stat", ".ax-section",
    "#ap-explore-grid .ap-launch-card", ".bp-mech-card", ".apc-safety", ".ac2-buybacks", ".cr-table", ".pf-summary"].join(",");
  const seen = new WeakSet();
  const io = !reduce && "IntersectionObserver" in window ? new IntersectionObserver((ents) => {
    ents.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const sib = el.parentElement ? [...el.parentElement.children].filter((c) => c.classList.contains("rv") && !c.classList.contains("rv-in")) : [];
      el.style.transitionDelay = `${Math.min(sib.indexOf(el), 6) * 55}ms`;
      el.classList.add("rv-in");
      io.unobserve(el);
    });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 }) : null;
  function scan(root) {
    if (!io) return;
    const els = root.matches && root.matches(REVEAL) ? [root] : [];
    if (root.querySelectorAll) els.push(...root.querySelectorAll(REVEAL));
    for (const el of els) {
      if (seen.has(el) || el.closest(".msheet")) continue;
      if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue; // hidden panel — handled when shown
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.96 && r.bottom > 0) continue; // already on screen: leave it be
      el.classList.add("rv");
      io.observe(el);
    }
  }
  if (io) {
    const kick = () => scan(document.body);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", kick); else kick();
    let q = null;
    new MutationObserver((muts) => {
      if (q) return;
      q = requestAnimationFrame(() => { q = null; muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) scan(n); })); });
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("arcpad:tab", () => setTimeout(kick, 30));
  }

  // ================= chart draw-in (first render per coin) =================
  function drawOnce(boxId, key) {
    const box = $(boxId);
    const svg = box && box.querySelector("svg");
    if (!svg || reduce) return;
    // The chart re-renders a few times while a coin loads; keep one continuous
    // draw-in across those re-renders by offsetting the new SVG's animation.
    if (box.__drawn !== key) { box.__drawn = key; box.__drawAt = performance.now(); }
    const elapsed = performance.now() - box.__drawAt;
    if (elapsed > 1500) return;
    svg.style.setProperty("--cd", `${-elapsed}ms`);
    svg.classList.add("chart-draw");
  }
  if (typeof apcRenderChart === "function") {
    const orig = apcRenderChart;
    // eslint-disable-next-line no-global-assign
    apcRenderChart = function () { orig.apply(this, arguments); try { if (typeof APC !== "undefined" && APC.trades && APC.trades.length) drawOnce("apc-chart", APC.token); } catch (e) { /* cosmetic */ } };
  }
  if (typeof ac2RenderChart === "function") {
    const orig = ac2RenderChart;
    // eslint-disable-next-line no-global-assign
    ac2RenderChart = function () { orig.apply(this, arguments); try { drawOnce("ac2-chart", "arcircle"); } catch (e) { /* cosmetic */ } };
  }

  // ================= launch rocket =================
  const ROCKET = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="rkG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4d9fff"/><stop offset="1" stop-color="#39ff88"/></linearGradient></defs>'
    + '<path class="rk-flame" d="M26 46c0 7 6 14 6 14s6-7 6-14z"/><path d="M32 4c9 6 13 16 13 27l-5 11H24l-5-11C19 20 23 10 32 4z" fill="url(#rkG)"/>'
    + '<circle cx="32" cy="24" r="5" fill="#050805" stroke="#eaf2e6" stroke-width="2"/><path d="M19 31l-7 9 9 1zM45 31l7 9-9 1z" fill="#35d8d0"/></svg>';
  const ls = $("ap-launch-status");
  if (ls) {
    let idle = null;
    new MutationObserver(() => {
      const pend = ls.querySelector(".status.pending");
      const ok = ls.querySelector(".status.success");
      const launching = pend && /Confirm the launch|Launching/.test(pend.textContent);
      if (launching && !pend.querySelector(".ap-rocket-idle")) {
        const r = document.createElement("span");
        r.className = "ap-rocket-idle"; r.innerHTML = ROCKET;
        pend.insertBefore(r, pend.firstChild);
        idle = r;
      }
      if (ok && !ok.__flew) {
        ok.__flew = true;
        const btn = $("ap-launch-submit");
        const rect = (idle && idle.isConnected ? idle : btn || ok).getBoundingClientRect();
        if (!reduce) {
          const f = document.createElement("div");
          f.className = "ap-rocket-fly"; f.innerHTML = ROCKET;
          f.style.left = `${rect.left + rect.width / 2 - 28}px`; f.style.top = `${rect.top - 10}px`;
          document.body.appendChild(f);
          setTimeout(() => f.remove(), 1700);
        }
        idle = null;
      }
    }).observe(ls, { childList: true, subtree: true });
  }

  // ================= dock bounce =================
  document.addEventListener("pointerdown", (e) => {
    const it = e.target.closest && e.target.closest(".ax-dock-item, .ax-quick a, .ax-quick button");
    if (!it || reduce) return;
    const ico = it.querySelector(".ax-dock-ico, span, svg") || it;
    ico.classList.remove("dock-bounce"); void ico.offsetWidth; ico.classList.add("dock-bounce");
  }, { passive: true });

  // ================= wallet menu =================
  const ARCIRCLE_TOKEN = "0x933a94b475fa9d8ef94fa564e38dda400a595aa1";
  async function fillBalances(box) {
    if (!state.account || !box) return;
    const acct = state.account;
    try {
      const p = readProvider();
      const tok = new ethers.Contract(ARCIRCLE_TOKEN, ERC20_ABI, p);
      const [nat, arc] = await Promise.all([p.getBalance(acct).catch(() => null), tok.balanceOf(acct).catch(() => null)]);
      if (state.account !== acct) return;
      const f = (v, d) => v == null ? "—" : Number(ethers.formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: 2 });
      box.querySelector("[data-wb=usdc]").textContent = f(nat, 18);
      box.querySelector("[data-wb=arc]").textContent = f(arc, 18);
    } catch { /* leave dashes */ }
  }
  function enhanceWallet() {
    const dd = $("wallet-dropdown");
    if (!dd || dd.__enh || !state.account) return;
    dd.__enh = true;
    const addr = dd.querySelector(".wallet-dropdown-address");
    const bal = document.createElement("div");
    bal.className = "wd-bal";
    bal.innerHTML = `<div><span>USDC <small>gas</small></span><b data-wb="usdc">…</b></div><div><span>$ARCIRCLE</span><b data-wb="arc">…</b></div>`;
    if (addr) addr.insertAdjacentElement("afterend", bal);
    const copy = $("wallet-dropdown-copy");
    if (copy) copy.onclick = (e) => {
      e.stopPropagation();
      (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(state.account) : Promise.reject()).then(
        () => { copy.textContent = "Copied"; setTimeout(() => { copy.textContent = "Copy"; }, 1400); },
        () => { copy.textContent = "Copy failed"; });
    };
    const explorer = dd.querySelector('a.wallet-dropdown-item[href*="/address/"]');
    const frag = document.createDocumentFragment();
    if ($("bp-panel-portfolio")) {
      const pf = document.createElement("button");
      pf.type = "button"; pf.className = "wallet-dropdown-item"; pf.textContent = "Portfolio";
      pf.onclick = (e) => { e.stopPropagation(); dd.classList.remove("open"); if (window.arcpadShowTab) window.arcpadShowTab("portfolio"); };
      frag.appendChild(pf);
    }
    const add = document.createElement("button");
    add.type = "button"; add.className = "wallet-dropdown-item"; add.textContent = "Add $ARCIRCLE to wallet";
    add.onclick = async (e) => {
      e.stopPropagation();
      const params = { type: "ERC20", options: { address: ARCIRCLE_TOKEN, symbol: "ARCIRCLE", decimals: 18, image: "https://www.arcircle.app/images/arcircle-mark-sm.png" } };
      try {
        if (state.signer && state.signer.provider && state.signer.provider.send) await state.signer.provider.send("wallet_watchAsset", params);
        else if (window.ethereum) await window.ethereum.request({ method: "wallet_watchAsset", params });
        else throw new Error("no wallet");
        add.textContent = "Added — check your wallet";
      } catch { add.textContent = "Your wallet didn't accept it"; }
      setTimeout(() => { add.textContent = "Add $ARCIRCLE to wallet"; }, 2600);
    };
    frag.appendChild(add);
    if (explorer) explorer.parentNode.insertBefore(frag, explorer); else dd.appendChild(frag);
    const pill = $("wallet-pill-btn");
    if (pill) pill.addEventListener("click", () => fillBalances(bal));
    fillBalances(bal);
  }
  if (typeof renderHeader === "function") {
    const orig = renderHeader;
    // eslint-disable-next-line no-global-assign
    renderHeader = function () { orig.apply(this, arguments); try { enhanceWallet(); } catch (e) { console.warn(e); } };
  }
  enhanceWallet();
})();
