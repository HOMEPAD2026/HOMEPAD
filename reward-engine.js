/* global CONFIG */
// reward-engine.js — the Reward page's burn engine: the burn meter (hero), the engine flow (live paths
// run today, dashed ones are being built), the live burn feed and "burned by source", the $ARCIRCLE and
// $ARCIA cards, milestones, and a wallet's own burn card (a share image). Numbers come from
// arc-token.js (/api/social?token=arcircle: burned.list / bySource / n) and /api/social?coin=arcia.
// When the server can't answer, the last reading this browser saw is shown with its time.
(function () {
  "use strict";
  if (!document.getElementById("rw-meter")) return;
  const $ = (id) => document.getElementById(id);
  const q = (sel, root) => (root || document).querySelector(sel);
  const qa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = () => window.arcToken;
  const SUPPLY = 1e9;
  const EXPLORER = "https://arc.etherscan.io";
  const MILESTONES = [15, 20, 25, 30, 40, 50, 60, 75, 90];
  const KIND = {
    vote: { name: "Burn-to-vote", acc: "#39ff88" },
    mine: { name: "Builder Mine", acc: "#ffc861" },
    scanner: { name: "Token Scanner", acc: "#4d9fff" },
    secret: { name: "ARCIA's secret file", acc: "#ff8fc7" },
    desk: { name: "ARCIA DESK", acc: "#b58bff" },
    agent: { name: "ARCIA AGENT vaults", acc: "#5b8cff" },
    orders: { name: "Orders & Predict fees", acc: "#4dd4ff" },
    omni: { name: "OMNI rewards", acc: "#e46bff" },
    buyback: { name: "Buyback", acc: "#35d8d0" },
    team: { name: "Team & treasury", acc: "#dfe8f1" },
    wallet: { name: "Direct burn", acc: "#ff8a4c" },
    pending: { name: "Being labeled", acc: "#6b7785" },
  };
  const kindOf = (k) => KIND[k] || KIND.pending;
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
  };
  const num = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : Math.round(n).toLocaleString("en-US"));
  const full = (n) => (n == null || !isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US"));
  const usd = (n) => (T() ? T().fmt.usd(n) : "$" + Number(n || 0).toFixed(2));
  const price = (n) => (n == null ? "—" : T() && T().fmt.price ? T().fmt.price(n) : "$" + Number(n).toPrecision(3));
  const ago = (ts) => (T() && T().fmt.ago ? T().fmt.ago(ts) : "");
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
  const countTo = (el, v, fmt) => { if (!el || v == null || !isFinite(v)) return; if (!reduce && T() && T().countTo) T().countTo(el, v, fmt); else el.textContent = fmt(v); };

  // ================= the meter =================
  let lastPct = null;
  function paintMeter(b, px, stale) {
    const m = $("rw-meter");
    const pct = b.pct, tok = b.tokens;
    const set = (k, v, fmt) => { const el = q(`[data-rb="${k}"]`, m); if (el) countTo(el, v, fmt); };
    set("pct", pct, (v) => v.toFixed(2) + "%");
    set("tok", tok, (v) => num(v));
    if (px) set("usd", tok * px, (v) => usd(v)); else q('[data-rb="usd"]', m).textContent = "—";
    if (b.n != null) set("n", b.n, (v) => Math.round(v).toLocaleString("en-US"));
    const fill = q('[data-rb="fill"]', m);
    requestAnimationFrame(() => { fill.style.width = Math.min(100, pct) + "%"; });
    const next = MILESTONES.find((x) => x > pct);
    const ms = q('[data-rb="ms"]', m);
    if (next) {
      ms.style.left = next + "%"; ms.hidden = false; ms.setAttribute("data-label", next + "%");
      q('[data-rb="next"]', m).textContent = tr("Next milestone") + " " + next + "% · " + num(((next - pct) / 100) * SUPPLY) + " $ARCIRCLE " + tr("to go");
    } else { ms.hidden = true; q('[data-rb="next"]', m).textContent = ""; }
    const bl = q('[data-rb="bar-label"]', m);
    if (bl) bl.setAttribute("aria-label", pct.toFixed(2) + "% of the 1,000,000,000 $ARCIRCLE supply burned");
    const inline = q('[data-rb="pct-inline"]');
    if (inline) inline.textContent = pct.toFixed(2) + "%";
    const st = q('[data-rb="stale"]', m);
    st.hidden = !stale;
    if (stale) st.textContent = tr("Showing the last reading this browser saw") + " (" + new Date(stale).toLocaleString() + "). " + tr("Live numbers return when Arc data catches up.");
    // a milestone crossed since this browser last looked: one celebration
    const seen = ls.get("rw-ms-seen");
    const crossed = MILESTONES.filter((x) => x <= pct && (seen == null || x > seen)).pop();
    if (crossed && seen != null) celebrate(crossed);
    if (seen == null || pct > seen) ls.set("rw-ms-seen", Math.floor(pct));
    if (lastPct != null && pct > lastPct) { m.classList.remove("rw-bump"); void m.offsetWidth; m.classList.add("rw-bump"); }
    lastPct = pct;
  }
  function celebrate(ms) {
    const m = $("rw-meter");
    const tag = document.createElement("div");
    tag.className = "rw-ms-hit";
    tag.textContent = ms + "% " + tr("burned — milestone reached");
    m.appendChild(tag);
    if (!reduce) embers(m, 36);
    setTimeout(() => tag.remove(), 6000);
  }
  function embers(host, n) {
    const box = document.createElement("div");
    box.className = "rw-embers"; box.setAttribute("aria-hidden", "true");
    for (let i = 0; i < n; i++) {
      const e = document.createElement("i");
      e.style.left = Math.random() * 100 + "%";
      e.style.animationDelay = Math.random() * 0.6 + "s";
      e.style.setProperty("--dx", (Math.random() * 60 - 30).toFixed(0) + "px");
      box.appendChild(e);
    }
    host.appendChild(box);
    setTimeout(() => box.remove(), 2600);
  }

  // ================= feed + sources =================
  const seenTx = new Set();
  let firstFeed = true, sayAt = 0;
  function paintFeed(list, at) {
    const ol = $("rw-feed");
    if (!list || !list.length) { ol.innerHTML = `<li class="rw-feed-empty">${esc(tr("No burns yet."))}</li>`; return; }
    const fresh = firstFeed ? [] : list.filter((x) => !seenTx.has(x.tx));
    ol.innerHTML = list.slice(0, 18).map((x) => {
      const k = kindOf(x.kind);
      const isNew = fresh.some((f) => f.tx === x.tx);
      return `<li class="rw-burn${isNew ? " rw-new" : ""}" style="--acc:${k.acc}">
        <span class="rw-burn-k"><i></i>${esc(tr(k.name))}</span>
        <b class="rw-burn-n" data-no-i18n>${esc(full(x.tokens))} <small>$ARCIRCLE</small></b>
        <span class="rw-burn-m" data-no-i18n>${esc(short(x.from))} · ${esc(ago(x.ts))}</span>
        <a class="rw-burn-tx" href="${EXPLORER}/tx/${esc(x.tx)}" target="_blank" rel="noopener" aria-label="${esc(tr("View transaction"))}">↗</a>
      </li>`;
    }).join("");
    list.forEach((x) => seenTx.add(x.tx));
    const fa = q('[data-rb="feed-at"]');
    if (fa) fa.textContent = at ? tr("updated") + " " + new Date(at).toLocaleTimeString() : "";
    if (fresh.length && Date.now() - sayAt > 20000) {
      sayAt = Date.now();
      const tot = fresh.reduce((s, x) => s + (x.tokens || 0), 0);
      arciaSay(tot);
      if (!reduce) embers($("rw-meter"), Math.min(24, 6 + fresh.length * 4));
    }
    firstFeed = false;
  }
  function arciaSay(tokens) {
    const wrap = q(".rw-feed-wrap");
    if (!wrap) return;
    let b = q(".rw-say", wrap);
    if (!b) { b = document.createElement("div"); b.className = "rw-say"; b.setAttribute("role", "status"); wrap.insertBefore(b, $("rw-feed")); }
    const lines = ["Another {n} $ARCIRCLE gone forever~ 💙💚", "{n} $ARCIRCLE just burned! ✨", "Burn engine says hi~ {n} $ARCIRCLE burned 🔥"];
    b.innerHTML = `<img src="images/arcia-avatar-96.jpg" alt="" width="28" height="28"><span data-no-i18n>${esc(tr(lines[Math.floor(Math.random() * lines.length)]).replace("{n}", full(tokens)))}</span>`;
    b.classList.remove("on"); void b.offsetWidth; b.classList.add("on");
    clearTimeout(b.__t); b.__t = setTimeout(() => b.classList.remove("on"), 6000);
  }
  function paintSources(by) {
    const ul = $("rw-srcbars");
    const rows = Object.entries(by || {}).filter(([, o]) => o && o.tokens > 0).sort((a, b) => b[1].tokens - a[1].tokens);
    if (!rows.length) { ul.innerHTML = `<li class="rw-feed-empty">${esc(tr("No burns yet."))}</li>`; return; }
    // two groups, each scaled to its own largest source (the team's early burns would flatten every utility bar);
    // the % stays each source's share of everything burned
    const tot = rows.reduce((s, [, o]) => s + o.tokens, 0);
    const TEAMISH = ["team", "buyback"];
    const groups = [["From utilities and the community", rows.filter(([k]) => !TEAMISH.includes(k))], ["From the team", rows.filter(([k]) => TEAMISH.includes(k))]].filter(([, r]) => r.length);
    ul.innerHTML = groups.map(([title, rs]) => {
      const max = rs[0][1].tokens;
      return `<li class="rw-sb-group">${esc(tr(title))}</li>` + rs.map(([k, o]) => {
        const K = kindOf(k), w = Math.max(2, (o.tokens / max) * 100);
        return `<li style="--acc:${K.acc}" data-kind="${esc(k)}">
        <div class="rw-sb-top"><span>${esc(tr(K.name))}</span><b data-no-i18n>${esc(num(o.tokens))} <small>· ${((o.tokens / tot) * 100).toFixed(o.tokens / tot < 0.01 ? 2 : 1)}%</small></b></div>
        <div class="rw-sb-bar"><i style="--w:${w.toFixed(1)}%"></i></div>
        <small class="rw-sb-n" data-no-i18n>${o.n.toLocaleString("en-US")} ${esc(tr(o.n === 1 ? "burn" : "burns"))}</small>
      </li>`;
      }).join("");
    }).join("");
    // bars grow when they're first seen
    const go = () => ul.classList.add("in");
    if (T() && T().onVisible) T().onVisible(ul, go); else go();
    // live sources in the engine light up with their totals
    qa(".rw-src[data-live]").forEach((el) => {
      const o = by[el.getAttribute("data-src")];
      let t = q(".rw-src-n", el);
      if (!t) { t = document.createElement("em"); t.className = "rw-src-n"; t.setAttribute("data-no-i18n", ""); el.appendChild(t); }
      t.textContent = o && o.tokens > 0 ? num(o.tokens) + " " + tr("burned") : "";
    });
  }

  // ================= coins =================
  function paintArc(d) {
    const set = (k, v) => { const el = q(`[data-rc="${k}"]`); if (el) el.textContent = v; };
    if (d.burned) set("arc-burned", num(d.burned.tokens) + " · " + d.burned.pct.toFixed(2) + "%");
    set("arc-price", price(d.price));
    set("arc-mcap", d.mcap != null ? usd(d.mcap) : "—");
  }
  function loadArcia() {
    if (document.hidden) return;
    fetch("/api/social?coin=arcia").then((r) => (r.ok ? r.json() : null)).then((a) => {
      if (!a || a.error) return;
      const set = (k, v) => { const el = q(`[data-rc="${k}"]`); if (el) el.textContent = v; };
      set("arcia-burned", a.burned != null ? num(a.burned) + (a.burnedPct != null ? " · " + a.burnedPct.toFixed(2) + "%" : "") : "—");
      set("arcia-price", price(a.price));
      set("arcia-mcap", a.mcap != null ? usd(a.mcap) : "—");
    }).catch(() => {});
  }

  // ================= the engine flow (desktop: an SVG over the three columns) =================
  function drawFlow() {
    const box = $("rw-flow"), svg = q(".rw-flow-svg", box);
    if (!box || !svg) return;
    const wide = box.clientWidth >= 880;
    svg.style.display = wide ? "" : "none";
    if (!wide) return;
    const r0 = box.getBoundingClientRect();
    const rel = (el) => { const r = el.getBoundingClientRect(); return { l: r.left - r0.left, r: r.right - r0.left, t: r.top - r0.top, b: r.bottom - r0.top, cy: (r.top + r.bottom) / 2 - r0.top }; };
    const contract = rel(q('[data-node="contract"]', box)), burn = rel(q('[data-node="burn"]', box)), rew = rel(q('[data-node="rewards"]', box));
    const curve = (x1, y1, x2, y2) => { const mx = (x1 + x2) / 2; return `M${x1.toFixed(1)},${y1.toFixed(1)} C${mx.toFixed(1)},${y1.toFixed(1)} ${mx.toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`; };
    let paths = "";
    qa(".rw-src", box).forEach((el) => {
      const s = rel(el), live = el.hasAttribute("data-live");
      if (live) {
        // live utilities burn straight to 0x…dEaD: a fan of curves into the burn node (behind the contract box)
        const k = qa(".rw-src[data-live]", box).indexOf(el), n = qa(".rw-src[data-live]", box).length;
        const ty = burn.t + 18 + ((burn.b - burn.t - 36) * (k + 0.5)) / n;
        paths += `<path class="rw-p rw-p-live" data-src="${el.getAttribute("data-src")}" d="${curve(s.r, s.cy, burn.l, ty)}"/>`;
      } else {
        paths += `<path class="rw-p rw-p-plan" data-src="${el.getAttribute("data-src")}" d="${curve(s.r, s.cy, contract.l, contract.cy)}"/>`;
      }
    });
    paths += `<path class="rw-p rw-p-plan rw-p-out" d="${curve(contract.r, contract.cy - 10, burn.l, burn.cy)}"/>`;
    paths += `<path class="rw-p rw-p-plan rw-p-out" d="${curve(contract.r, contract.cy + 10, rew.l, rew.cy)}"/>`;
    svg.setAttribute("viewBox", `0 0 ${box.clientWidth} ${box.clientHeight}`);
    svg.innerHTML = paths;
  }
  function hoverFlow() {
    const box = $("rw-flow");
    box.addEventListener("mouseover", (e) => {
      const s = e.target.closest && e.target.closest(".rw-src");
      box.classList.toggle("rw-focus", !!s);
      qa(".rw-p", box).forEach((p) => p.classList.toggle("on", !!s && p.getAttribute("data-src") === s.getAttribute("data-src")));
      qa(".rw-src", box).forEach((x) => x.classList.toggle("on", x === s));
    });
    box.addEventListener("mouseleave", () => { box.classList.remove("rw-focus"); qa(".rw-p.on, .rw-src.on", box).forEach((x) => x.classList.remove("on")); });
  }

  // ================= a wallet's own burns + its share card =================
  let walletBurn = null;
  document.addEventListener("reward:wallet", (e) => {
    const ws = e.detail && e.detail.wallet, addr = e.detail && e.detail.address;
    const n = $("rw-wburn"), sub = $("rw-wburn-sub"), btn = $("rw-wburn-share");
    if (!n) return;
    const b = ws && ws.burned;
    if (!b) { n.textContent = "—"; sub.textContent = tr("Couldn't read burns right now"); btn.hidden = true; return; }
    n.textContent = full(b.tokens) + " $ARCIRCLE";
    const parts = Object.entries(b.bySource || {}).sort((x, y) => y[1].tokens - x[1].tokens).map(([k, o]) => tr(kindOf(k).name) + " " + num(o.tokens));
    sub.textContent = b.tokens > 0 ? parts.join(" · ") : tr("No $ARCIRCLE burned from this wallet yet");
    btn.hidden = !(b.tokens > 0);
    walletBurn = { addr, b };
  });
  function card() {
    if (!walletBurn) return;
    const { addr, b } = walletBurn;
    const c = document.createElement("canvas");
    c.width = 1200; c.height = 630;
    const g = c.getContext("2d");
    const bg = g.createLinearGradient(0, 0, 1200, 630);
    bg.addColorStop(0, "#050910"); bg.addColorStop(1, "#0b0f16");
    g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
    const glow = g.createRadialGradient(980, 520, 20, 980, 520, 520);
    glow.addColorStop(0, "rgba(255,138,76,.45)"); glow.addColorStop(1, "rgba(255,138,76,0)");
    g.fillStyle = glow; g.fillRect(0, 0, 1200, 630);
    const glow2 = g.createRadialGradient(120, 60, 10, 120, 60, 520);
    glow2.addColorStop(0, "rgba(63,155,255,.28)"); glow2.addColorStop(1, "rgba(63,155,255,0)");
    g.fillStyle = glow2; g.fillRect(0, 0, 1200, 630);
    const font = (w, px) => `${w} ${px}px Sora, Inter, system-ui, sans-serif`;
    g.fillStyle = "#eef3f7"; g.font = font(800, 22); g.fillText("ARCIRCLE PAD · BURN ENGINE", 72, 92);
    g.fillStyle = "rgba(222,233,244,.66)"; g.font = font(600, 30); g.fillText("I burned", 72, 196);
    const grad = g.createLinearGradient(72, 0, 900, 0);
    grad.addColorStop(0, "#ffc861"); grad.addColorStop(1, "#ff6a3d");
    g.fillStyle = grad; g.font = font(800, 104); g.fillText(full(b.tokens), 72, 306);
    g.fillStyle = "#eef3f7"; g.font = font(800, 44); g.fillText("$ARCIRCLE", 76, 368);
    g.font = font(600, 24); g.fillStyle = "rgba(222,233,244,.72)";
    const rows = Object.entries(b.bySource || {}).sort((x, y) => y[1].tokens - x[1].tokens).slice(0, 4);
    rows.forEach(([k, o], i) => { g.fillStyle = kindOf(k).acc; g.fillRect(76, 420 + i * 38, 12, 12); g.fillStyle = "rgba(222,233,244,.8)"; g.fillText(kindOf(k).name + " · " + full(o.tokens), 100, 432 + i * 38); });
    g.font = font(500, 22); g.fillStyle = "rgba(222,233,244,.55)";
    g.fillText(short(addr) + " · sent to 0x…dEaD, gone forever", 72, 590);
    g.textAlign = "right"; g.fillStyle = "#eef3f7"; g.font = font(700, 24); g.fillText("arcircle.app/reward", 1128, 590);
    // a small flame
    const fx = 1000, fy = 300;
    [["#ff6a3d", 120], ["#ffb35c", 82], ["#fff1c9", 42]].forEach(([col, s]) => {
      g.fillStyle = col; g.beginPath();
      g.moveTo(fx, fy - s * 1.25); g.bezierCurveTo(fx + s * 0.9, fy - s * 0.3, fx + s * 0.8, fy + s * 0.75, fx, fy + s * 0.8);
      g.bezierCurveTo(fx - s * 0.8, fy + s * 0.75, fx - s * 0.9, fy - s * 0.3, fx, fy - s * 1.25); g.fill();
    });
    openCard(c, b);
  }
  function openCard(c, b) {
    let dlg = $("rw-card-dlg");
    if (!dlg) {
      dlg = document.createElement("div");
      dlg.id = "rw-card-dlg"; dlg.className = "rw-card-dlg"; dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.setAttribute("aria-label", tr("Your burn card"));
      dlg.innerHTML = `<div class="rw-card-box"><button type="button" class="rw-card-x" aria-label="${esc(tr("Close"))}">×</button><img alt=""><div class="rw-card-acts"><a class="ax-btn ax-btn-grad" data-a="save" download="arcircle-burn-card.png">${esc(tr("Save image"))}</a><a class="ax-btn ax-btn-ghost" data-a="x" target="_blank" rel="noopener">${esc(tr("Post on X"))}</a></div><p class="rw-mini">${esc(tr("Save the image, then attach it to your post."))}</p></div>`;
      document.body.appendChild(dlg);
      dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest(".rw-card-x")) dlg.hidden = true; });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") dlg.hidden = true; });
    }
    const url = c.toDataURL("image/png");
    q("img", dlg).src = url;
    q('[data-a="save"]', dlg).href = url;
    const text = `I've burned ${full(b.tokens)} $ARCIRCLE on ARCIRCLE PAD, sent to 0x…dEaD for good 🔥\n\nBuilding the burn engine on Arc ♾ @ARCIRCLEonArc\n\narcircle.app/reward`;
    q('[data-a="x"]', dlg).href = "https://x.com/intent/tweet?text=" + encodeURIComponent(text);
    dlg.hidden = false;
    q(".rw-card-x", dlg).focus();
  }

  // ================= wiring =================
  function onStats(d) {
    let b = d && d.burned, px = d && d.price, stale = 0;
    const saved = ls.get("rw-burn-last");
    if (b && b.pct != null) ls.set("rw-burn-last", { at: Date.now(), burned: b, price: px });
    else if (saved && saved.burned) { b = saved.burned; px = saved.price; stale = saved.at; }
    if (!b || b.pct == null) return;
    paintMeter(b, px, stale);
    paintFeed(b.list, stale || Date.now());
    if (b.bySource) paintSources(b.bySource);
    paintArc({ burned: b, price: px, mcap: px != null ? px * SUPPLY : null });
  }
  function init() {
    // the last reading first, so the page is never empty while Arc answers
    const saved = ls.get("rw-burn-last");
    if (saved && saved.burned) { paintMeter(saved.burned, saved.price, 0); paintFeed(saved.burned.list, saved.at); if (saved.burned.bySource) paintSources(saved.burned.bySource); }
    if (T()) T().subscribe(onStats);
    loadArcia(); setInterval(loadArcia, 30000);
    drawFlow(); hoverFlow();
    let rt = 0;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(drawFlow, 120); });
    document.addEventListener("reward:tab", (e) => { if (e.detail && e.detail.tab === "engine") requestAnimationFrame(drawFlow); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawFlow);
    document.addEventListener("click", (e) => {
      const cp = e.target.closest && e.target.closest(".rw-copy[data-copy]");
      if (cp) {
        const done = () => { const o = cp.textContent; cp.textContent = tr("Copied"); setTimeout(() => { cp.textContent = o; }, 1400); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(cp.getAttribute("data-copy")).then(done, () => {});
        return;
      }
      if (e.target.closest && e.target.closest("#rw-wburn-share")) card();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
