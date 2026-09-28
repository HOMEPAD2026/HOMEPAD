/* global ethers, CONFIG, state, connectWallet, ensureArcForWrite, readProvider */
// arc-mine.js — Builder Mine, an ARCIRCLE PAD utility (arcpad.html#mine).
// Holders open a mine with part of a token's supply; builders (Arc's miners) join with 1 USDC, mine in the
// browser and claim what they dug. Whatever isn't mined is burned. Items bought with $ARCIRCLE are burned.
//   · the rules, the checks and the hourly settle: api/_mine.mjs (routes: api/mine.mjs)
//   · the contract: contracts/contracts/BuilderMine.sol
//   · the hashing: mine-worker.js (Web Workers — only while you press Start and the tab is visible)
//   · links in: #mine?id=<n>&r=<wallet>   a mine, joined through someone's link
// Until the contract is deployed the page runs a practice mine: same game, nothing is sent or paid.
(function () {
  "use strict";
  const panel = document.getElementById("bp-panel-mine");
  if (!panel) return;
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tr = (s) => (window.arcI18n && window.arcI18n.get() !== "en" && window.arcI18n.translate(s)) || s;
  const T = (s) => esc(tr(s));
  const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const toast = (m, k) => { if (typeof window.arcToast === "function") window.arcToast(tr(m), k); };
  const EXPL = (kind, x) => `${(typeof CONFIG !== "undefined" && CONFIG.BLOCK_EXPLORER) || "https://arc.etherscan.io"}/${kind}/${x}`;
  const USDC = (typeof CONFIG !== "undefined" && CONFIG.USDC_ADDRESS) || "0x3600000000000000000000000000000000000000";
  const ARCIRCLE = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
  const now = () => Math.floor(Date.now() / 1000);
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const fmtN = (n, d = 0) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d }));
  const trim0 = (s) => s.replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
  const compact = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? trim0((n / 1e9).toFixed(2)) + "B" : n >= 1e6 ? trim0((n / 1e6).toFixed(2)) + "M" : n >= 1e4 ? trim0((n / 1e3).toFixed(1)) + "K" : fmtN(n, n < 10 ? 4 : 2));
  const units = (raw, dec) => { try { return Number(ethers.formatUnits(BigInt(raw || 0), dec == null ? 18 : dec)); } catch (e) { return 0; } };
  const dur = (s) => { s = Math.max(0, Math.floor(s)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };

  const MINE_ABI = [
    "function join(uint256 id, address referrer)",
    "function buyItem(uint256 itemId, uint256 mineId)",
    "function claim(uint256 id, address account, uint256 cumulative, bytes32[] proof)",
    "function openMine(address token, uint256 amount, uint64 days_, uint64 startDelay) returns (uint256)",
    "function burnUnmined(uint256 id)",
    "function burnUnclaimed(uint256 id)",
  ];
  const ERC20 = ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)", "function name() view returns (string)"];
  const LAYER_COL = [["#6aa84f", "#4f7d3a"], ["#b98352", "#8a5e38"], ["#8a92a0", "#666e7c"], ["#9a8a5a", "#6f6340"], ["#4d5a74", "#343f55"], ["#8f3b2b", "#5e2419"]];
  const PICK_COL = ["#a8743f", "#9aa1ab", "#d9dee6", "#ffc861", "#6ff3ff", "url"];
  const DEFAULT_GAME = {
    epoch: 3600, shareBits: 21, goldBits: 27, diamondBits: 31, goldPoints: 20, diamondPoints: 100, cap: 600, batchEvery: 12, minGap: 8, maxBatch: 60, bonusCap: 100,
    layers: ["Topsoil", "Clay", "Stone", "Ore vein", "Deep rock", "Core"], layerParts: [32, 16, 8, 4, 2, 1],
    pickaxes: [{ tier: 0, name: "Wooden pickaxe", mult: 1 }, { tier: 1, name: "Stone pickaxe", mult: 1.2 }, { tier: 2, name: "Iron pickaxe", mult: 1.5 }, { tier: 3, name: "Gold pickaxe", mult: 1.8 }, { tier: 4, name: "Diamond pickaxe", mult: 2.2 }, { tier: 5, name: "Infinite pickaxe", mult: 2.6 }],
    boosts: [{ kind: 1, name: "Lantern", effect: "+15% for 24 h", pct: 15 }, { kind: 2, name: "Dynamite", effect: "+50% for 1 h", pct: 50 }, { kind: 3, name: "Lucky charm", effect: "rare ores twice as often for 24 h", pct: 0 }, { kind: 4, name: "Overtime", effect: "+50% hourly cap for 24 h", pct: 0 }],
    holder: [[100000, 10], [1000000, 20], [5000000, 30]], postPct: 5, postMax: 5, refPct: 5, refMax: 5, referredPct: 5, streakPct: 2, streakMax: 10, streakMin: 30,
    items: [[50000, 1, 0, 0], [150000, 2, 0, 0], [400000, 3, 0, 0], [1000000, 4, 0, 0], [2500000, 5, 0, 0], [30000, 0, 1, 86400], [20000, 0, 2, 3600], [40000, 0, 3, 86400], [30000, 0, 4, 86400]],
  };

  const S = {
    booted: false, cfg: null, G: DEFAULT_GAME, list: [], id: null, view: null, me: null, tab: "rig",
    live: false, address: "", practice: false,
    sess: null, mining: false, workers: [], rates: {}, queue: [], work: null, power: Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1)),
    local: { shares: 0, gold: 0, diamond: 0, dug: 0 }, subTimer: 0, pollTimer: 0, clock: 0, busy: false, capHit: false,
  };
  const G = () => S.G;
  const mineAddr = () => S.address || ((typeof CONFIG !== "undefined" && isAddr(CONFIG.BUILDER_MINE_ADDRESS)) ? CONFIG.BUILDER_MINE_ADDRESS : "");
  const api = async (q, opt) => { const r = await fetch(`/api/mine?${q}`, { cache: "no-store", ...(opt || {}) }); const j = await r.json().catch(() => ({})); if (!r.ok && !j.error) j.error = `HTTP ${r.status}`; j._status = r.status; return j; };
  const post = (q, body) => api(q, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  // =====================================================================================
  // the scene: a cross-section of the mine, the builder at the rock face, particles
  // =====================================================================================
  const Scene = (() => {
    let cv = null, cx = null, W = 0, H = 0, dpr = 1, raf = 0, last = 0, on = false;
    const LH = 340, SURF = 190;                      // layer height, sky above the surface (world px)
    let depth = 0.06, targetDepth = 0.06, tier = 0, t = 0, swing = 0, swingV = 0, hit = 0, shake = 0, flash = 0, flashCol = "#fff", crack = 0;
    let parts = [], floats = [], idle = true, label = "", layerNames = DEFAULT_GAME.layers;
    let rocks = null;
    const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    function makeRocks() {
      rocks = [];
      for (let l = 0; l < 6; l++) for (let i = 0; i < 26; i++) rocks.push({ l, x: rnd(), y: rnd(), r: 5 + rnd() * 16, a: rnd() * 6.28, ore: rnd() < (0.05 + l * 0.035) ? (rnd() < 0.18 + l * 0.05 ? "d" : "g") : "" });
    }
    function size() {
      if (!cv) return;
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(280, r.width); H = Math.max(240, r.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function mount(c) { cv = c; cx = c.getContext("2d"); if (!rocks) makeRocks(); size(); }
    const worldY = () => SURF + depth * LH * 6;        // the builder's feet (at 68% of the view)
    function start() { if (on || !cv) return; on = true; last = performance.now(); raf = requestAnimationFrame(loop); }
    function stop() { on = false; cancelAnimationFrame(raf); }
    function loop(ts) {
      if (!on) return;
      const dt = Math.min(0.05, (ts - last) / 1000); last = ts; t += dt;
      step(dt); draw();
      raf = requestAnimationFrame(loop);
    }
    function step(dt) {
      depth += (targetDepth - depth) * Math.min(1, dt * 1.5);
      // idle swing while mining: a steady rhythm; a found share adds a hard hit
      if (!idle) { swingV += dt * 1.25; if (swingV >= 1) { swingV -= 1; chips(3, 0.6); crack = Math.min(1, crack + 0.02); } }
      else swingV = Math.max(0, swingV - dt);
      const phase = idle ? 0 : swingV;
      const target = idle ? 0.15 : phase < 0.62 ? -1.25 * (phase / 0.62) : -1.25 + 2.1 * Math.min(1, (phase - 0.62) / 0.18);
      swing += (target - swing) * Math.min(1, dt * 18);
      hit = Math.max(0, hit - dt * 3); shake = Math.max(0, shake - dt * 2.4); flash = Math.max(0, flash - dt * 2.2);
      for (const p of parts) { p.vy += (p.g == null ? 900 : p.g) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.rot += p.vr * dt; }
      parts = parts.filter((p) => p.life > 0);
      for (const f of floats) { f.y -= 42 * dt; f.life -= dt; }
      floats = floats.filter((f) => f.life > 0);
    }
    // the builder's spot, scale and the rock face in front of them (screen px)
    const geo = () => { const sc = W < 520 ? 1.25 : 1.6, bx = W * (W < 520 ? 0.55 : 0.58), fy = H * 0.68; return { sc, bx, fy, fx: bx + 50 * sc, gh: 74 * sc }; };
    function face() { const g = geo(); return { x: g.fx, y: g.fy - 40 * g.sc }; }
    function chips(n, force = 1, col) {
      if (reduce) n = Math.min(n, 3);
      const f = face();
      for (let i = 0; i < n; i++) parts.push({ x: f.x, y: f.y + (Math.random() - 0.5) * 30, vx: -60 - Math.random() * 220 * force, vy: -120 - Math.random() * 260 * force, life: 0.7 + Math.random() * 0.7, s: 2 + Math.random() * 4 * force, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, col: col || LAYER_COL[Math.min(5, Math.floor(depth * 6))][Math.random() < 0.5 ? 0 : 1] });
    }
    function sparkle(n, col) {
      const f = face();
      for (let i = 0; i < (reduce ? Math.min(n, 6) : n); i++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 260; parts.push({ x: f.x - 10, y: f.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 0.8 + Math.random() * 0.8, s: 2 + Math.random() * 3.5, rot: 0, vr: 0, col, star: true, g: 380 }); }
    }
    function float(text, col, big) { const f = face(), k = floats.filter((x) => x.big).length; floats.push({ x: f.x - 60 + (Math.random() - 0.5) * 50, y: f.y - 50 - (big ? k * 26 : 0), text, col, life: big ? 2.2 : 1.1, big }); }
    function share(kind) {
      swingV = 0.62; hit = 1; crack = Math.min(1, crack + 0.12);
      if (kind === "diamond") { chips(18, 1.3); sparkle(46, "#7ff6ff"); float(tr("DIAMOND") + " +" + G().diamondPoints, "#7ff6ff", true); shake = reduce ? 0 : 1; flash = 1; flashCol = "rgba(127,246,255,.35)"; crack = 0; }
      else if (kind === "gold") { chips(12, 1.1); sparkle(26, "#ffd35c"); float(tr("GOLD") + " +" + G().goldPoints, "#ffd35c", true); shake = reduce ? 0 : 0.55; flash = 0.6; flashCol = "rgba(255,211,92,.25)"; }
      else { chips(7, 0.9); float("+1", "#eaf2e6"); if (crack >= 1) { crack = 0; chips(16, 1.2); } }
    }
    // ---- drawing ----
    function roundRect(x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
    function draw() {
      if (!cx) return;
      const sx = shake ? (Math.random() - 0.5) * 14 * shake : 0, sy = shake ? (Math.random() - 0.5) * 10 * shake : 0;
      const camY = worldY() - H * 0.68;               // world y at the top of the view
      cx.save(); cx.clearRect(0, 0, W, H); cx.translate(sx, sy);
      // sky
      const skyB = SURF - camY;
      if (skyB > 0) {
        const g = cx.createLinearGradient(0, skyB - SURF, 0, skyB); g.addColorStop(0, "#0a1630"); g.addColorStop(1, "#16335a");
        cx.fillStyle = g; cx.fillRect(0, 0, W, skyB);
        cx.fillStyle = "rgba(255,255,255,.55)"; for (let i = 0; i < 24; i++) { const x = (i * 97.3) % W, y = ((i * 53.1) % Math.max(1, skyB - 40)); cx.globalAlpha = 0.3 + 0.3 * Math.sin(t * 1.3 + i); cx.fillRect(x, y, 1.6, 1.6); } cx.globalAlpha = 1;
        // headframe over the shaft
        const hx = W * 0.3;
        cx.strokeStyle = "#8fa3c0"; cx.lineWidth = 3;
        cx.beginPath(); cx.moveTo(hx - 34, skyB); cx.lineTo(hx, skyB - 92); cx.lineTo(hx + 34, skyB); cx.moveTo(hx - 22, skyB - 34); cx.lineTo(hx + 22, skyB - 34); cx.moveTo(hx - 12, skyB - 64); cx.lineTo(hx + 12, skyB - 64); cx.stroke();
        cx.fillStyle = "#ffc861"; cx.beginPath(); cx.arc(hx, skyB - 92, 9, 0, 6.28); cx.fill();
        cx.strokeStyle = "#20262f"; cx.lineWidth = 2; cx.beginPath(); cx.arc(hx, skyB - 92, 5 + 2 * Math.sin(t * 4), 0, 6.28); cx.stroke();
        cx.fillStyle = "#cfe0f5"; cx.font = "700 13px Sora, Inter, sans-serif"; cx.textAlign = "left"; if (label) cx.fillText(label, hx + 44, skyB - 70);
      }
      // strata
      for (let l = 0; l < 6; l++) {
        const top = SURF + l * LH - camY, bot = top + LH;
        if (bot < 0 || top > H) continue;
        const g = cx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, LAYER_COL[l][0]); g.addColorStop(1, LAYER_COL[l][1]);
        cx.fillStyle = g; cx.fillRect(0, top, W, LH);
        if (l === 0) { cx.fillStyle = "#79c65a"; cx.fillRect(0, top, W, 8); cx.fillStyle = "#4f8f3a"; for (let x = 0; x < W; x += 9) cx.fillRect(x, top + 6, 5, 4 + ((x * 7) % 5)); }
        cx.fillStyle = "rgba(0,0,0,.28)"; cx.fillRect(0, top, W, 3);
        for (const r of rocks) if (r.l === l) {
          const x = r.x * W, y = top + 12 + r.y * (LH - 24);
          if (r.ore) {
            const glint = 0.55 + 0.45 * Math.sin(t * 2.2 + r.a * 3);
            cx.fillStyle = r.ore === "d" ? `rgba(127,246,255,${0.55 + 0.4 * glint})` : `rgba(255,211,92,${0.55 + 0.4 * glint})`;
            cx.save(); cx.translate(x, y); cx.rotate(r.a); cx.fillRect(-r.r * 0.3, -r.r * 0.3, r.r * 0.6, r.r * 0.6); cx.restore();
          } else { cx.fillStyle = "rgba(0,0,0,.16)"; cx.beginPath(); cx.ellipse(x, y, r.r, r.r * 0.6, r.a, 0, 6.28); cx.fill(); cx.fillStyle = "rgba(255,255,255,.07)"; cx.beginPath(); cx.ellipse(x - 2, y - 2, r.r * 0.6, r.r * 0.3, r.a, 0, 6.28); cx.fill(); }
        }
        cx.fillStyle = "rgba(255,255,255,.82)"; cx.font = "700 12px Sora, Inter, sans-serif"; cx.textAlign = "left";
        cx.fillText(`${l + 1} · ${tr(layerNames[l] || "")}`, 14, top + 24);
        cx.fillStyle = "rgba(255,255,255,.55)"; cx.font = "600 11px Inter, sans-serif";
        cx.fillText(`${G().layerParts[l]}/63 ${tr("of the mine")}`, 14, top + 40);
      }
      // the shaft and the gallery to the face
      const gg = geo(), fy = gg.fy, sxh = W * (W < 520 ? 0.2 : 0.3), top0 = Math.max(0, SURF - camY), gtop = fy - gg.gh;
      cx.fillStyle = "rgba(8,10,14,.88)";
      cx.fillRect(sxh - 22, top0, 44, fy - top0 + 4);
      roundRect(sxh - 22, gtop, gg.fx - sxh + 24, gg.gh + 4, 18); cx.fill();
      cx.strokeStyle = "rgba(160,120,70,.7)"; cx.lineWidth = 3;
      for (let y = top0 + ((camY % 22) + 22) % 22; y < gtop + 4; y += 22) { cx.beginPath(); cx.moveTo(sxh - 12, y); cx.lineTo(sxh + 12, y); cx.stroke(); }
      cx.beginPath(); cx.moveTo(sxh - 12, top0); cx.lineTo(sxh - 12, gtop + 6); cx.moveTo(sxh + 12, top0); cx.lineTo(sxh + 12, gtop + 6); cx.stroke();
      // rails and timber props in the gallery
      cx.strokeStyle = "rgba(150,160,175,.55)"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(sxh + 20, fy - 3); cx.lineTo(gg.fx - 6, fy - 3); cx.stroke();
      cx.fillStyle = "#6b4a2b"; for (let x = sxh + 44; x < gg.bx - 34 * gg.sc; x += 64) { cx.fillRect(x, gtop, 7, gg.gh + 4); cx.fillRect(x - 6, gtop - 4, 19, 7); }
      // a cart of what's been dug
      const cartX = sxh + 34;
      if (cartX + 44 < gg.bx - 30 * gg.sc) { cx.fillStyle = "#39414d"; roundRect(cartX, fy - 26, 44, 20, 4); cx.fill(); cx.fillStyle = LAYER_COL[Math.min(5, Math.floor(depth * 6))][0]; cx.beginPath(); cx.ellipse(cartX + 22, fy - 26, 20, 7, 0, Math.PI, 0); cx.fill(); cx.fillStyle = "#15181d"; cx.beginPath(); cx.arc(cartX + 10, fy - 4, 5, 0, 6.28); cx.arc(cartX + 34, fy - 4, 5, 0, 6.28); cx.fill(); }
      // the rock face with its cracks
      const f = face();
      cx.fillStyle = LAYER_COL[Math.min(5, Math.floor(depth * 6))][1]; roundRect(gg.fx - 4, gtop - 4, 44, gg.gh + 8, 10); cx.fill();
      cx.strokeStyle = `rgba(0,0,0,${0.35 + crack * 0.4})`; cx.lineWidth = 2; cx.beginPath();
      const n = 1 + Math.floor(crack * 5); for (let i = 0; i < n; i++) { const yy = gtop + 8 + i * (gg.gh / 6); cx.moveTo(f.x + 2, yy); cx.lineTo(f.x + 14, yy + 7); cx.lineTo(f.x + 8, yy + 13); } cx.stroke();
      // lamp light
      const lx = gg.bx + 12 * gg.sc, ly = fy - 82 * gg.sc;
      const lg = cx.createRadialGradient(lx, ly, 4, lx + 30, ly + 10, 170);
      lg.addColorStop(0, `rgba(255,236,170,${0.42 + 0.05 * Math.sin(t * 9)})`); lg.addColorStop(1, "rgba(255,236,170,0)");
      cx.fillStyle = lg; cx.beginPath(); cx.moveTo(lx, ly); cx.lineTo(lx + 190, ly - 50); cx.lineTo(lx + 190, ly + 120); cx.closePath(); cx.fill();
      drawBuilder(gg.bx, fy, gg.sc);
      // particles & floating text
      for (const p of parts) {
        cx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
        cx.fillStyle = p.col;
        if (p.star) { cx.beginPath(); cx.arc(p.x, p.y, p.s, 0, 6.28); cx.fill(); }
        else { cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); cx.restore(); }
      }
      cx.globalAlpha = 1;
      for (const fl of floats) {
        cx.globalAlpha = Math.max(0, Math.min(1, fl.life));
        cx.font = `800 ${fl.big ? 22 : 14}px Sora, Inter, sans-serif`; cx.textAlign = "center";
        cx.lineWidth = 4; cx.strokeStyle = "rgba(0,0,0,.6)"; cx.strokeText(fl.text, fl.x, fl.y); cx.fillStyle = fl.col; cx.fillText(fl.text, fl.x, fl.y);
      }
      cx.globalAlpha = 1;
      cx.restore();
      if (flash) { cx.fillStyle = flashCol; cx.globalAlpha = flash; cx.fillRect(0, 0, W, H); cx.globalAlpha = 1; }
      const v = cx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.55)"); cx.fillStyle = v; cx.fillRect(0, 0, W, H);
    }
    function pickStroke() {
      if (tier === 5) { const g = cx.createLinearGradient(-6, -60, 30, -40); g.addColorStop(0, "#4d9fff"); g.addColorStop(0.5, "#35d8d0"); g.addColorStop(1, "#39ff88"); return g; }
      return PICK_COL[tier] || PICK_COL[0];
    }
    function drawBuilder(x, y, sc) {
      const bob = idle ? Math.sin(t * 2) * 1.2 : Math.sin(swingV * 6.28) * 1.6;
      cx.save(); cx.translate(x, y + bob); cx.scale(sc, sc);
      // shadow
      cx.fillStyle = "rgba(0,0,0,.35)"; cx.beginPath(); cx.ellipse(0, 0, 22, 5, 0, 0, 6.28); cx.fill();
      // legs & boots
      cx.fillStyle = "#2b3a55"; cx.fillRect(-11, -30, 9, 26); cx.fillRect(3, -30, 9, 26);
      cx.fillStyle = "#1a1d22"; cx.fillRect(-13, -6, 13, 6); cx.fillRect(2, -6, 14, 6);
      // body (overalls + jacket)
      cx.fillStyle = "#3f6fb5"; roundRect(-14, -62, 28, 36, 7); cx.fill();
      cx.fillStyle = "#ffc861"; cx.fillRect(-14, -46, 28, 4);
      cx.fillStyle = "#2f548c"; cx.fillRect(-8, -60, 16, 14);
      // head
      cx.fillStyle = "#f0c9a0"; cx.beginPath(); cx.arc(1, -74, 11, 0, 6.28); cx.fill();
      cx.fillStyle = "#1b1f27"; cx.beginPath(); cx.arc(5, -75, 1.6, 0, 6.28); cx.fill();
      // helmet + lamp
      cx.fillStyle = "#ffc861"; cx.beginPath(); cx.arc(1, -78, 12.5, Math.PI, 0); cx.fill(); cx.fillRect(-13, -79, 29, 4);
      cx.fillStyle = "#fff6cf"; cx.beginPath(); cx.arc(11, -83, 3.6, 0, 6.28); cx.fill();
      // arm + pickaxe
      cx.save(); cx.translate(4, -56); cx.rotate(swing);
      cx.fillStyle = "#3f6fb5"; roundRect(-4, -4, 26, 8, 4); cx.fill();
      cx.fillStyle = "#f0c9a0"; cx.beginPath(); cx.arc(23, 0, 4.5, 0, 6.28); cx.fill();
      cx.strokeStyle = "#7a5230"; cx.lineWidth = 4; cx.lineCap = "round"; cx.beginPath(); cx.moveTo(20, 10); cx.lineTo(26, -34); cx.stroke();
      cx.strokeStyle = pickStroke(); cx.lineWidth = 6; cx.beginPath(); cx.moveTo(8, -30); cx.quadraticCurveTo(26, -44, 46, -28); cx.stroke();
      if (tier >= 4) { cx.shadowColor = tier === 5 ? "#35d8d0" : "#6ff3ff"; cx.shadowBlur = 14; cx.stroke(); cx.shadowBlur = 0; }
      cx.restore();
      cx.restore();
    }
    return {
      mount, start, stop, size, share, chips,
      set(o) {
        if (o.depth != null) targetDepth = Math.max(0.02, Math.min(0.985, o.depth));
        if (o.jump) depth = targetDepth;
        if (o.tier != null) tier = o.tier;
        if (o.idle != null) idle = o.idle;
        if (o.label != null) label = o.label;
        if (o.layers) layerNames = o.layers;
      },
    };
  })();

  // =====================================================================================
  // the frame
  // =====================================================================================
  function frame() {
    const body = $("bm-body");
    if (!body) return;
    body.innerHTML = `
      <div class="bm-banner" id="bm-banner" hidden></div>
      <div class="bm-mines" id="bm-mines" role="list" aria-label="${T("Mines")}"></div>
      <div class="bm-steps" id="bm-steps" aria-label="${T("How to start")}"></div>
      <div class="bm-stage" id="bm-stage">
        <canvas id="bm-canvas" aria-label="${T("The mine, drawn live")}" role="img"></canvas>
        <div class="bm-hud tl" id="bm-hud-tl"></div>
        <div class="bm-hud tr" id="bm-hud-tr"></div>
        <div class="bm-hud bl" id="bm-hud-bl"></div>
        <div class="bm-dock">
          <button type="button" class="bm-go" id="bm-go"><span class="bm-go-ico" aria-hidden="true"></span><b>${T("Start mining")}</b></button>
          <div class="bm-power" role="radiogroup" aria-label="${T("Power")}" id="bm-power"></div>
        </div>
        <div class="bm-gauge" id="bm-gauge" aria-hidden="true"></div>
      </div>
      <div class="bm-tabs" role="tablist" id="bm-tabs"></div>
      <div class="bm-tabbody" id="bm-tabbody"></div>`;
    Scene.mount($("bm-canvas"));
    Scene.set({ layers: G().layers });
    $("bm-go").addEventListener("click", toggleMining);
    body.addEventListener("click", onClick);
    body.addEventListener("submit", onSubmit);
    body.addEventListener("input", onInput);
    paintPower();
  }
  function paintPower() {
    const max = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    $("bm-power").innerHTML = `<span>${T("Power")}</span>` + Array.from({ length: max }, (_, i) => `<button type="button" role="radio" aria-checked="${S.power === i + 1}" data-power="${i + 1}" class="${S.power === i + 1 ? "on" : ""}">${i + 1}</button>`).join("");
  }

  // ---------------- mines strip ----------------
  function mineCard(m) {
    const sym = m.token ? m.token.symbol : "?", dec = m.token ? m.token.decimals : 18;
    const left = m.status === "live" ? dur(m.end - now()) : m.status === "soon" ? tr("opens in") + " " + dur(m.start - now()) : tr(m.status === "closed" ? "closed" : "ended");
    return `<button type="button" role="listitem" class="bm-mc ${S.id === m.id ? "on" : ""} st-${m.status}" data-mine="${m.id}">
      <span class="bm-mc-top"><b data-no-i18n>$${esc(sym)}</b><em class="bm-st">${T(m.status === "live" ? "Live" : m.status === "soon" ? "Soon" : "Ended")}</em></span>
      <span class="bm-mc-amt" data-no-i18n>${compact(units(m.deposited, dec))}</span>
      <span class="bm-mc-sub">${T("Layer")} ${m.layer + 1}/6 · ${fmtN(m.builders)} ${T("builders")}</span>
      <span class="bm-mc-bar"><i style="width:${Math.min(100, (units(m.emittedNow, dec) / Math.max(1e-18, units(m.deposited, dec))) * 100).toFixed(1)}%"></i></span>
      <span class="bm-mc-sub">${esc(left)}</span></button>`;
  }
  function paintMines() {
    const el = $("bm-mines");
    if (!el) return;
    const cards = S.list.map(mineCard);
    if (S.practice) cards.unshift(`<button type="button" role="listitem" class="bm-mc ${S.id === "practice" ? "on" : ""} st-live" data-mine="practice"><span class="bm-mc-top"><b>${T("Practice")}</b><em class="bm-st">${T("Free")}</em></span><span class="bm-mc-amt">${T("No rewards")}</span><span class="bm-mc-sub">${T("Same game — try your pickaxe")}</span><span class="bm-mc-bar"><i style="width:${Math.min(100, S.local.dug * 100).toFixed(1)}%"></i></span><span class="bm-mc-sub">${T("Nothing is sent or paid")}</span></button>`);
    cards.push(`<button type="button" role="listitem" class="bm-mc bm-mc-new" data-act="open"><span class="bm-plus" aria-hidden="true">+</span><b>${T("Open a mine")}</b><span class="bm-mc-sub">${T("Put part of your token's supply in the ground")}</span></button>`);
    el.innerHTML = cards.join("");
  }
  function paintBanner() {
    const el = $("bm-banner");
    if (!el) return;
    if (!S.live) { el.hidden = false; el.innerHTML = `<b>${T("Practice mine")}</b> ${T("The Builder Mine contract isn't live on Arc yet. Mine here for fun — the game is the same, but nothing is sent, paid or claimed.")}`; return; }
    const rd = S.cfg && S.cfg.ready;
    if (rd && (!rd.secret || !rd.store)) { el.hidden = false; el.innerHTML = `<b>${T("Setting up")}</b> ${T("Mining opens as soon as the server side is switched on.")}`; return; }
    el.hidden = true;
  }

  // ---------------- steps ----------------
  function paintSteps() {
    const el = $("bm-steps");
    if (!el) return;
    if (S.id === "practice" || !S.view) { el.innerHTML = ""; return; }
    const me = S.me || {};
    const steps = [
      ["Connect", !!state.account, state.account ? "" : `<button type="button" class="bm-mini" data-act="connect">${T("Connect")}</button>`],
      ["Join · 1 USDC", !!me.joined, me.joined || !state.account ? "" : `<button type="button" class="bm-mini hot" data-act="join">${T("Join")}</button>`],
      ["Mine", (me.hour && me.hour.shares > 0) || BigInt(me.mined || 0) > 0n, ""],
      ["Post on X", !!me.verified, me.joined && !me.verified ? `<button type="button" class="bm-mini" data-act="tab" data-tab="proof">${T("Post")}</button>` : ""],
      ["Claim", BigInt((me.claimable && me.claimable.claimed) || 0) > 0n, ""],
    ];
    const cur = steps.findIndex((s) => !s[1]);
    el.innerHTML = `<ol>${steps.map((s, i) => `<li class="${s[1] ? "done" : i === cur ? "cur" : ""}"><i>${s[1] ? "✓" : i + 1}</i><span>${T(s[0])}</span>${i === cur ? s[2] : ""}</li>`).join("")}</ol>`;
  }

  // ---------------- HUD ----------------
  function hashRate() { return Object.values(S.rates).reduce((n, x) => n + x, 0); }
  function paintHud() {
    const v = S.view, me = S.me, g = G();
    const tl = $("bm-hud-tl"), trr = $("bm-hud-tr"), bl = $("bm-hud-bl"), gauge = $("bm-gauge"), go = $("bm-go");
    if (!tl) return;
    let layer = 0, frac = 0.06, leftTxt = "", sym = "";
    if (S.id === "practice") { frac = 0.03 + S.local.dug * 0.95; layer = Math.min(5, Math.floor(frac * 6)); leftTxt = tr("Practice"); }
    else if (v) {
      const tt = now(), span = Math.max(1, v.end - v.start);
      frac = Math.max(0.02, Math.min(0.985, (tt - v.start) / span)); layer = Math.min(5, Math.floor(frac * 6));
      const layerEnd = v.start + Math.ceil(((tt - v.start) / span) * 6 + 1e-9) * (span / 6);
      leftTxt = tt < v.start ? tr("Opens in") + " " + dur(v.start - tt) : tt >= v.end ? tr("Mine ended") : `${tr("Next layer in")} ${dur(layerEnd - tt)}`;
      sym = v.token ? v.token.symbol : "";
    }
    Scene.set({ depth: frac, tier: me ? me.pickaxe : 0, label: sym ? `$${sym}` : tr("Practice mine") });
    tl.innerHTML = `<b>${T("Layer")} ${layer + 1} · ${T(g.layers[layer])}</b><span>${esc(leftTxt)}</span>`;
    const hr = hashRate();
    const cap = me ? me.cap : g.cap;
    const shares = S.id === "practice" ? S.local.shares : me && me.hour ? me.hour.shares + S.queue.length : 0;
    trr.innerHTML = `<b data-no-i18n>${hr ? (hr >= 1e6 ? (hr / 1e6).toFixed(2) + " MH/s" : (hr / 1e3).toFixed(0) + " kH/s") : "— H/s"}</b>
      <span>${T("This hour")} <em data-no-i18n>${fmtN(Math.min(shares, cap))} / ${fmtN(cap)}</em></span>
      <span class="bm-capbar"><i style="width:${Math.min(100, (shares / Math.max(1, cap)) * 100).toFixed(1)}%"></i></span>`;
    const mult = me && me.weight ? me.weight.mult : 1;
    const pick = g.pickaxes[(me && me.pickaxe) || 0];
    bl.innerHTML = `<span class="bm-chip pk t${(me && me.pickaxe) || 0}">${T(pick.name)}</span><span class="bm-chip mult" title="${T("Pickaxe × (1 + bonuses)")}">×${mult.toFixed(2)}</span>` +
      (me && me.hour && me.hour.of ? `<span class="bm-chip">${T("Your share of this hour")} <b data-no-i18n>${((me.hour.points / Math.max(1, me.hour.of)) * 100).toFixed(1)}%</b></span>` : "") +
      (S.id === "practice" ? `<span class="bm-chip">${T("Gold")} ${S.local.gold} · ${T("Diamond")} ${S.local.diamond}</span>` : "");
    gauge.innerHTML = g.layers.map((n, i) => `<i class="${i < layer ? "past" : i === layer ? "now" : ""}" style="--c:${LAYER_COL[i][0]}"><span>${i + 1}</span></i>`).join("") + `<b style="top:${(frac * 100).toFixed(1)}%"></b>`;
    if (go) {
      const can = S.id === "practice" || (v && me && me.joined && now() >= v.start && now() < v.end);
      go.classList.toggle("on", S.mining);
      go.classList.toggle("off", !can && !S.mining);
      go.querySelector("b").textContent = tr(S.mining ? "Stop" : S.capHit ? "Hourly cap reached" : S.id === "practice" ? "Start mining" : !state.account ? "Connect to mine" : v && me && !me.joined ? "Join to mine" : "Start mining");
    }
  }

  // ---------------- tabs ----------------
  const TABS = [["rig", "Pickaxes"], ["boosts", "Boosts"], ["proof", "Post & invite"], ["board", "Leaderboard"], ["claim", "Claim"], ["how", "How it works"]];
  function paintTabs() {
    const el = $("bm-tabs");
    if (!el) return;
    el.innerHTML = TABS.map(([k, n]) => `<button type="button" role="tab" aria-selected="${S.tab === k}" class="${S.tab === k ? "on" : ""}" data-tab="${k}">${T(n)}</button>`).join("");
    const b = $("bm-tabbody");
    b.innerHTML = S.tab === "rig" ? tabRig() : S.tab === "boosts" ? tabBoosts() : S.tab === "proof" ? tabProof() : S.tab === "board" ? tabBoard() : S.tab === "claim" ? tabClaim() : tabHow();
  }
  function itemsList() {
    const it = S.cfg && Array.isArray(S.cfg.items) && S.cfg.items.length ? S.cfg.items : G().items.map(([p, tier, boost, d], id) => ({ id, price: (BigInt(p) * 10n ** 18n).toString(), tier, boost, duration: d, active: true }));
    return it;
  }
  const arcAmt = (raw) => compact(units(raw, 18));
  function tabRig() {
    const me = S.me || {}, have = me.pickaxe || 0, items = itemsList();
    const priceOf = (tier) => { const x = items.find((i) => i.tier === tier); return x ? BigInt(x.price) : 0n; };
    const cards = G().pickaxes.map((p) => {
      const owned = p.tier <= have, next = p.tier === have + 1;
      const cost = p.tier === 0 ? 0n : priceOf(p.tier) - (have > 0 ? priceOf(have) : 0n);
      const it = items.find((i) => i.tier === p.tier);
      return `<div class="bm-pick t${p.tier} ${owned ? "own" : ""} ${p.tier === have ? "cur" : ""}">
        <span class="bm-pick-art" aria-hidden="true">${pickSvg(p.tier)}</span>
        <b>${T(p.name)}</b><span class="bm-pick-x">×${p.mult.toFixed(1)}</span>
        <span class="bm-pick-p">${p.tier === 0 ? T("Everyone starts here") : owned ? T("Owned") : `<em data-no-i18n>${arcAmt(cost)}</em> $ARCIRCLE`}</span>
        ${!owned && it && it.active ? `<button type="button" class="bm-mini ${next ? "hot" : ""}" data-act="buy" data-item="${it.id}">${T(have ? "Upgrade & burn" : "Buy & burn")}</button>` : ""}
      </div>`;
    }).join("");
    return `<p class="bm-note">${T("A pickaxe is yours for good and works in every mine. An upgrade costs only the difference. Every $ARCIRCLE you pay is burned.")}</p><div class="bm-picks">${cards}</div>`;
  }
  function tabBoosts() {
    const me = S.me || {}, items = itemsList().filter((i) => i.boost > 0), until = me.boosts || [0, 0, 0, 0];
    const t = now();
    const cards = items.map((i) => {
      const b = G().boosts.find((x) => x.kind === i.boost) || {};
      const left = until[i.boost - 1] - t;
      return `<div class="bm-boost k${i.boost} ${left > 0 ? "live" : ""}">
        <span class="bm-boost-art" aria-hidden="true">${boostSvg(i.boost)}</span>
        <b>${T(b.name || "Boost")}</b><span>${T(b.effect || "")}</span>
        <span class="bm-pick-p"><em data-no-i18n>${arcAmt(i.price)}</em> $ARCIRCLE</span>
        ${left > 0 ? `<span class="bm-live">${T("Active")} · ${dur(left)}</span>` : ""}
        ${i.active ? `<button type="button" class="bm-mini" data-act="buy" data-item="${i.id}" ${S.id === "practice" || !me.joined ? "disabled" : ""}>${T(left > 0 ? "Extend & burn" : "Light & burn")}</button>` : ""}
      </div>`;
    }).join("");
    return `<p class="bm-note">${T("Boosts belong to one mine and run for a set time. Buy them after you join. The $ARCIRCLE is burned.")}</p><div class="bm-boosts">${cards}</div>`;
  }
  function tweetText() {
    const v = S.view, sym = v && v.token ? v.token.symbol : "";
    // the post stays in English (it goes out on X, where the mine's builders read it)
    return `I'm a builder on Arc, mining $${sym} in Builder Mine on ARCIRCLE PAD ♾\n\nJoin with 1 USDC and dig with me:`;
  }
  function tabProof() {
    const me = S.me || {}, v = S.view;
    if (S.id === "practice" || !v) return `<p class="bm-note">${T("In a live mine, your first X post unlocks claiming, and every post on a new day adds +5% (up to +25%). Builders who join through your link add +5% each (up to +25%).")}</p>`;
    if (!state.account) return `<p class="bm-note">${T("Connect your wallet to get your card and link.")}</p>`;
    const link = me.link || `${location.origin}/mine/${S.id}?r=${String(state.account).toLowerCase()}`;
    const card = `/api/og?mine=${S.id}&w=${String(state.account).toLowerCase()}&t=${Math.floor(Date.now() / 60000)}`;
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(tweetText())}&url=${encodeURIComponent(link)}`;
    return `<div class="bm-proof">
      <div class="bm-card-prev"><img src="${esc(card)}" alt="${T("Your Builder Mine card")}" loading="lazy" width="600" height="315"></div>
      <div class="bm-proof-r">
        <ol class="bm-proof-steps">
          <li class="${me.verified ? "done" : ""}"><b>${T("Post your card on X")}</b><span>${T("Your link has your wallet in it — that's how the post proves it's you.")}</span>
            <div class="bm-row"><a class="bm-mini hot" href="${esc(intent)}" target="_blank" rel="noopener">${T("Post on X")}</a><button type="button" class="bm-mini" data-act="copy" data-copy="${esc(link)}">${T("Copy my link")}</button></div></li>
          <li class="${me.verified ? "done" : ""}"><b>${T("Paste the post's link")}</b>
            <form class="bm-row" id="bm-xform"><input id="bm-xurl" type="url" inputmode="url" placeholder="https://x.com/you/status/…" aria-label="${T("Link to your post")}" ${me.joined ? "" : "disabled"}><button class="bm-mini" type="submit" ${me.joined ? "" : "disabled"}>${T("Verify")}</button></form>
            <span class="bm-sm" id="bm-xmsg">${me.verified ? `${T("Verified as")} <b data-no-i18n>@${esc(me.x)}</b> · ${fmtN(me.posts)} ${T(me.posts === 1 ? "post" : "posts")} · +${Math.min(G().postMax, Math.max(0, me.posts - 1)) * G().postPct}%` : me.joined ? T("Your first verified post unlocks claiming.") : T("Join the mine first.")}</span></li>
        </ol>
        <div class="bm-refbox"><b>${T("Referrals")}</b><span>${fmtN(me.refs || 0)} ${T("builders joined with your link and posted")} · +${Math.min(G().refMax, me.refs || 0) * G().refPct}%</span><span class="bm-sm">${T("They get +5% too.")}</span></div>
      </div></div>`;
  }
  function tabBoard() {
    const v = S.view;
    if (!v) return `<p class="bm-note">${T("The leaderboard fills as builders mine.")}</p>`;
    const dec = v.token ? v.token.decimals : 18, me = String(state.account || "").toLowerCase();
    const rows = (v.top || []).map((r, i) => `<li class="${r.w === me ? "me" : ""}"><i>${i + 1}</i><span data-no-i18n>${r.x ? "@" + esc(r.x) : short(r.w)}</span><b data-no-i18n>${compact(units(r.amt, dec))}</b><em data-no-i18n>${fmtN(r.pts)} ${T("pts")}</em></li>`).join("");
    const feed = (v.feed || []).map((f) => `<li class="k-${f.kind}"><i class="bm-ore ${f.kind}" aria-hidden="true"></i><span data-no-i18n>${short(f.w)}</span><b>${T(f.kind === "diamond" ? "found a diamond" : "found gold")}</b><em>${dur(now() - f.t)} ${T("ago")}</em></li>`).join("");
    return `<div class="bm-board"><div><h3>${T("Top builders")}</h3>${rows ? `<ol class="bm-top">${rows}</ol>` : `<p class="bm-note">${T("Settled every hour — the first results appear after the first hour.")}</p>`}</div>
      <div><h3>${T("Rare finds")}</h3>${feed ? `<ul class="bm-feed">${feed}</ul>` : `<p class="bm-note">${T("No gold or diamonds yet.")}</p>`}</div></div>`;
  }
  function tabClaim() {
    const v = S.view, me = S.me || {};
    if (S.id === "practice" || !v) return `<p class="bm-note">${T("Practice finds aren't paid. Pick a live mine to mine for real.")}</p>`;
    const dec = v.token ? v.token.decimals : 18, sym = v.token ? v.token.symbol : "";
    const mined = BigInt(me.mined || 0), cum = BigInt((me.claimable && me.claimable.cumulative) || 0), done = BigInt((me.claimable && me.claimable.claimed) || 0);
    const owed = cum > done ? cum - done : 0n;
    const t = now(), ended = t >= v.end, finalBy = v.end + 3 * 86400, burnBy = v.end + 33 * 86400;
    const pending = mined > cum ? mined - cum : 0n;
    return `<div class="bm-claim">
      <div class="bm-kpis">
        <div><span>${T("Mined")}</span><b data-no-i18n>${compact(units(mined, dec))} $${esc(sym)}</b></div>
        <div><span>${T("Claimable now")}</span><b class="hot" data-no-i18n>${compact(units(owed, dec))}</b></div>
        <div><span>${T("Claimed")}</span><b data-no-i18n>${compact(units(done, dec))}</b></div>
      </div>
      ${pending > 0n && !me.verified ? `<p class="bm-warn">${T("You have")} <b data-no-i18n>${compact(units(pending, dec))} $${esc(sym)}</b> ${T("waiting. Prove one X post to unlock it — unproven amounts are burned when the mine ends.")}</p>` : pending > 0n ? `<p class="bm-note">${T("The rest arrives with the next hourly root.")}</p>` : ""}
      <button type="button" class="bm-go small" data-act="claim" ${owed > 0n && me.claimable.proof ? "" : "disabled"}>${T("Claim")} ${owed > 0n ? `<span data-no-i18n>${compact(units(owed, dec))} $${esc(sym)}</span>` : ""}</button>
      <ul class="bm-rules">
        <li>${T("Roots are posted every hour and can only grow.")}</li>
        <li>${T("Claims stay open for 30 days after the final root")} (<span data-no-i18n>${new Date(burnBy * 1000).toISOString().slice(0, 10)}</span>).</li>
        <li>${T("Then anything unclaimed is burned. Nothing ever goes back to the mine's creator.")}</li>
      </ul>
      ${ended && t > finalBy && !v.unminedBurned ? `<button type="button" class="bm-mini" data-act="burn1">${T("Burn the unmined part")}</button>` : ""}
      ${t > burnBy && !v.closed ? `<button type="button" class="bm-mini" data-act="burn2">${T("Burn what's unclaimed and close")}</button>` : ""}
      ${v.burned && v.burned !== "0" ? `<p class="bm-note">${T("Burned so far")}: <b data-no-i18n>${compact(units(v.burned, dec))} $${esc(sym)}</b></p>` : ""}
    </div>`;
  }
  function tabHow() {
    const g = G();
    const bars = g.layerParts.map((p, i) => `<div class="bm-hbar" style="--h:${(p / 32) * 100}%;--c:${LAYER_COL[i][0]}"><i></i><span>${i + 1}</span><em>${((p / 63) * 100).toFixed(1)}%</em></div>`).join("");
    return `<div class="bm-how">
      <div><h3>${T("Six layers, each half as rich")}</h3><div class="bm-hbars">${bars}</div><p class="bm-note">${T("A mine runs 3–60 days in six equal layers. The first layer releases half of everything, so the earliest builders dig the richest ground.")}</p></div>
      <div><h3>${T("Your weight each hour")}</h3>
        <p class="bm-formula"><b>${T("points")}</b> × <b>${T("pickaxe")}</b> × (1 + <b>${T("bonuses")}</b>)</p>
        <ul class="bm-rules">
          <li>${T("Points: every share counts 1 (up to")} ${fmtN(g.cap)} ${T("an hour), gold +")}${g.goldPoints}, ${T("diamond +")}${g.diamondPoints}.</li>
          <li>${T("Pickaxes ×1.2 to ×2.6. Bonuses add up to +100% at most:")}</li>
          <li class="sub">${T("$ARCIRCLE held: 100K +10%, 1M +20%, 5M +30%")}</li>
          <li class="sub">${T("Each extra X post on a new day +5% (up to +25%)")}</li>
          <li class="sub">${T("Each referral who posted +5% (up to +25%); joining through a link +5%")}</li>
          <li class="sub">${T("Daily streak (30+ shares a day) +2% a day, up to +20%")}</li>
          <li class="sub">${T("Lantern +15%, Dynamite +50%")}</li>
        </ul>
        <p class="bm-note">${T("Each hour's release is split by weight. Your browser does the hashing only while you press Start and the tab is open.")}</p></div>
      <div><h3>${T("Fair by design")}</h3><ul class="bm-rules">
        <li>${T("1 USDC to join, one X account per wallet, an hourly cap per wallet.")}</li>
        <li>${T("The mine's tokens sit in the contract. Nobody — not the creator, not ARCIRCLE PAD — can take them back.")}</li>
        <li>${T("Unmined tokens and unproven shares are burned when the mine ends. Items are paid in $ARCIRCLE and burned.")}</li>
        <li>${T("Every root is capped on-chain by the halving schedule.")}</li>
      </ul></div></div>`;
  }
  function pickSvg(tier) {
    const col = ["#a8743f", "#9aa1ab", "#d9dee6", "#ffc861", "#6ff3ff", "url(#bmInf)"][tier];
    return `<svg viewBox="0 0 48 48"><defs><linearGradient id="bmInf" x1="0" x2="1"><stop offset="0" stop-color="#4d9fff"/><stop offset=".5" stop-color="#35d8d0"/><stop offset="1" stop-color="#39ff88"/></linearGradient></defs><path d="M14 40 32 14" stroke="#7a5230" stroke-width="4.5" stroke-linecap="round"/><path d="M12 16c8-7 18-8 26-2-7-1-14 1-19 6z" fill="${col}" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/></svg>`;
  }
  function boostSvg(k) {
    if (k === 1) return `<svg viewBox="0 0 48 48"><rect x="16" y="14" width="16" height="22" rx="4" fill="#3a2f1c" stroke="#ffc861" stroke-width="2"/><circle cx="24" cy="25" r="5" fill="#fff1b8"/><path d="M19 14v-4h10v4M24 10V6" stroke="#ffc861" stroke-width="2" fill="none"/></svg>`;
    if (k === 2) return `<svg viewBox="0 0 48 48"><rect x="12" y="18" width="7" height="20" rx="2" fill="#e2553b"/><rect x="20.5" y="18" width="7" height="20" rx="2" fill="#e2553b"/><rect x="29" y="18" width="7" height="20" rx="2" fill="#e2553b"/><path d="M24 18c0-5 4-6 6-10" stroke="#ffc861" stroke-width="2" fill="none"/><circle cx="31" cy="8" r="2.5" fill="#ffd35c"/></svg>`;
    if (k === 3) return `<svg viewBox="0 0 48 48"><path d="M24 8 29 19l12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#39ff88" stroke="#1f7a45" stroke-width="1.5"/></svg>`;
    return `<svg viewBox="0 0 48 48"><path d="M14 18h18v14a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7z" fill="#e8dcc8"/><path d="M32 21h3a4 4 0 0 1 0 8h-3" stroke="#e8dcc8" stroke-width="3" fill="none"/><path d="M19 13c0-3 3-3 3-6M25 13c0-3 3-3 3-6" stroke="#9fb098" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
  }

  // =====================================================================================
  // data
  // =====================================================================================
  async function loadCfg() {
    const j = await api("cfg=1").catch(() => ({}));
    S.cfg = j && !j.error ? j : null;
    if (S.cfg && S.cfg.game) S.G = { ...DEFAULT_GAME, ...S.cfg.game };
    S.live = !!(S.cfg && S.cfg.live);
    S.address = S.cfg && S.cfg.address ? S.cfg.address : "";
    S.practice = !S.live;
  }
  async function loadList() {
    if (!S.live) { S.list = []; return; }
    const j = await api("list=1").catch(() => ({}));
    S.list = Array.isArray(j.mines) ? j.mines : [];
  }
  async function loadMine() {
    if (S.id == null || S.id === "practice") { S.view = null; S.me = null; return; }
    const [v, me] = await Promise.all([api(`id=${S.id}`), state.account ? api(`id=${S.id}&w=${state.account}`) : Promise.resolve(null)]);
    S.view = v && !v.error ? v : null;
    S.me = me && !me.error ? me : null;
  }
  async function refresh(all) {
    try {
      if (all) { await loadCfg(); await loadList(); }
      if (S.id == null) S.id = S.practice ? "practice" : (S.list.find((m) => m.status === "live") || S.list[0] || { id: "practice" }).id;
      if (S.id === "practice" && !S.practice && S.list.length) S.id = S.list[0].id;
      if (S.id === "practice") S.practice = true;
      await loadMine();
    } catch (e) { /* keep what we had */ }
    paintAll();
  }
  function paintAll() { paintBanner(); paintMines(); paintSteps(); paintHud(); paintTabs(); }

  // =====================================================================================
  // mining
  // =====================================================================================
  function sessKey() { return `bm.s.${String(state.account || "").toLowerCase()}`; }
  async function ensureSession() {
    const w = String(state.account || "").toLowerCase();
    if (S.sess && S.sess.w === w && S.sess.exp > now() + 600) return S.sess.token;
    const saved = lsGet(sessKey());
    if (saved) { try { const o = JSON.parse(saved); if (o.exp > now() + 600) { S.sess = { w, ...o }; return o.token; } } catch (e) { /* re-sign */ } }
    if (!state.signer) throw new Error("Connect your wallet first.");
    const t = now();
    toast("Sign once to start mining — it's only a signature.");
    const sig = await state.signer.signMessage(`Builder Mine · ARCIRCLE PAD\nSign in to mine with this wallet. No transaction, nothing can move.\nWallet: ${w}\nTime: ${t}`);
    const j = await post("auth=1", { w, t, sig });
    if (j.error) throw new Error(j.error);
    S.sess = { w, token: j.token, exp: j.exp };
    lsSet(sessKey(), JSON.stringify({ token: j.token, exp: j.exp }));
    return j.token;
  }
  let workerUrl = null;
  function workerSrc() {
    if (workerUrl) return workerUrl;
    const s = document.querySelector('script[src*="arcpad-tools.bundle.js"],script[src*="arc-mine.js"]');
    const v = s ? (/[?&]v=(\d+)/.exec(s.src) || [])[1] : "";
    workerUrl = "/mine-worker.js" + (v ? "?v=" + v : "");
    return workerUrl;
  }
  function stopWorkers() { S.workers.forEach((w) => { try { w.postMessage({ cmd: "stop" }); w.terminate(); } catch (e) { /* gone */ } }); S.workers = []; S.rates = {}; }
  function startWorkers(chHex, bits) {
    stopWorkers();
    const ch = Array.from(chHex.replace(/^0x/, "").match(/../g), (x) => parseInt(x, 16));
    for (let i = 0; i < S.power; i++) {
      let wk;
      try { wk = new Worker(workerSrc()); } catch (e) { toast("This browser can't run the miner (Web Workers are off)."); return false; }
      const key = "w" + i;
      wk.onmessage = (e) => {
        const m = e.data || {};
        if (m.type === "rate") S.rates[key] = m.hps;
        else if (m.type === "share") onShare(m.nonce, m.z);
      };
      wk.postMessage({ cmd: "start", ch, hi: (Math.random() * 2 ** 32) >>> 0, lo: (Math.random() * 2 ** 32) >>> 0, bits });
      S.workers.push(wk);
    }
    return true;
  }
  function kindOf(z) {
    const lucky = S.me && S.me.weight && S.me.weight.lucky ? 1 : 0;
    return z >= G().diamondBits - lucky ? "diamond" : z >= G().goldBits - lucky ? "gold" : "share";
  }
  function onShare(nonce, z) {
    const kind = kindOf(z);
    Scene.share(kind);
    if (kind !== "share" && typeof window.arcConfetti === "function" && !reduce && kind === "diamond") window.arcConfetti({ count: 90 });
    if (S.id === "practice") {
      S.local.shares++; if (kind === "gold") S.local.gold++; if (kind === "diamond") S.local.diamond++;
      S.local.dug = Math.min(1, S.local.dug + 1 / 900);
      if (S.local.shares >= G().cap) { S.capHit = true; stopMining(true); toast("Practice cap reached — in a live mine, Overtime raises it."); }
      return;
    }
    S.queue.push(nonce);
    const cap = S.me ? S.me.cap : G().cap;
    if (S.me && S.me.hour && S.me.hour.shares + S.queue.length >= cap) { S.capHit = true; flush().finally(() => stopMining(true)); toast("Hourly cap reached. Mining resumes next hour — or light Overtime."); }
  }
  async function flush() {
    if (!S.queue.length || !S.work || S.id === "practice") return;
    const nonces = S.queue.splice(0, G().maxBatch);
    const j = await post(`shares=${S.id}`, { w: String(state.account).toLowerCase(), s: S.sess && S.sess.token, nonces }).catch(() => ({ error: "offline" }));
    if (j.auth) { S.sess = null; lsSet(sessKey(), null); }
    if (j.error) { if (j._status === 429) S.queue.unshift(...nonces); return; }
    if (S.me && S.me.hour) { S.me.hour.shares = j.shares; S.me.hour.gold = j.gold; S.me.hour.diamond = j.diamond; S.me.cap = j.cap; }
    paintHud();
  }
  async function getWork() {
    const token = await ensureSession();
    const j = await api(`work=${S.id}&w=${String(state.account).toLowerCase()}&s=${encodeURIComponent(token)}`);
    if (j.auth) { S.sess = null; lsSet(sessKey(), null); throw new Error("Sign in again."); }
    if (j.error) throw new Error(j.error);
    S.work = { ...j, at: Date.now() };
    return S.work;
  }
  async function startMining() {
    if (S.mining || S.busy) return;
    S.capHit = false;
    if (S.id === "practice") {
      const ch = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
      if (!startWorkers(ch, G().shareBits)) return;
      S.mining = true; Scene.set({ idle: false }); tickClock(); paintHud(); return;
    }
    if (!state.account) { if (typeof connectWallet === "function") await connectWallet(); if (!state.account) return; await refresh(); }
    if (!S.me || !S.me.joined) { await join(); return; }
    S.busy = true;
    try {
      const w = await getWork();
      if (!startWorkers(w.challenge, w.bits)) return;
      S.mining = true; Scene.set({ idle: false });
      clearInterval(S.subTimer);
      S.subTimer = setInterval(() => { flush(); }, Math.max(G().minGap, G().batchEvery) * 1000);
      tickClock();
    } catch (e) { toast(String(e.message || e)); }
    finally { S.busy = false; paintHud(); }
  }
  function stopMining(keepCapFlag) {
    S.mining = false; stopWorkers(); clearInterval(S.subTimer); Scene.set({ idle: true });
    if (!keepCapFlag) S.capHit = false;
    flush(); paintHud();
  }
  function toggleMining() { if (S.mining) stopMining(); else startMining(); }
  // the hour turns: hand in what's queued a few seconds before, then fetch the new challenge
  function tickClock() {
    clearInterval(S.clock);
    S.clock = setInterval(async () => {
      paintHud();
      if (!S.work || S.id === "practice") return;
      const left = S.work.endsIn - (Date.now() - S.work.at) / 1000;
      if (left < 4 && !S.work.flushed) { S.work.flushed = true; await flush(); S.queue = []; }
      if (left <= 0) {
        const was = S.mining || S.capHit;
        stopWorkers(); S.work = null; S.capHit = false;
        await loadMine(); paintAll();
        if (was && !document.hidden) { S.mining = false; startMining(); }
      }
    }, 1000);
  }

  // =====================================================================================
  // transactions
  // =====================================================================================
  async function withTx(label, fn) {
    if (!mineAddr()) { toast("The Builder Mine contract isn't live yet."); return; }
    if (!state.account && typeof connectWallet === "function") await connectWallet();
    if (!state.account) return;
    try {
      if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
      if (!state.signer) throw new Error("Wallet isn't ready — reconnect and try again.");
      await fn(new ethers.Contract(mineAddr(), MINE_ABI, state.signer));
      await refresh(true);
    } catch (e) {
      const m = e && (e.code === "ACTION_REJECTED" || e.code === 4001) ? "You cancelled in your wallet." : String((e && (e.shortMessage || e.reason || e.message)) || e).slice(0, 160);
      toast(m);
    }
  }
  async function approveIf(token, amount) {
    const c = new ethers.Contract(token, ERC20, state.signer);
    const have = await c.allowance(state.account, mineAddr());
    if (have >= amount) return;
    toast("Approve in your wallet first.");
    const tx = await c.approve(mineAddr(), amount);
    await tx.wait();
  }
  async function join() {
    await withTx("join", async (m) => {
      const fee = BigInt((S.cfg && S.cfg.joinFee) || "1000000");
      const bal = await new ethers.Contract(USDC, ERC20, state.signer).balanceOf(state.account);
      if (bal < fee) throw new Error("You need 1 USDC on Arc to join.");
      await approveIf(USDC, fee);
      const ref = lsGet(`bm.ref.${S.id}`) || "";
      const tx = await m.join(S.id, isAddr(ref) && ref.toLowerCase() !== String(state.account).toLowerCase() ? ref : ethers.ZeroAddress);
      toast("Joining…"); await tx.wait();
      toast("You're a builder in this mine. Press Start.");
      if (typeof window.arcConfetti === "function" && !reduce) window.arcConfetti({ count: 70 });
    });
  }
  async function buy(itemId) {
    const it = itemsList().find((i) => i.id === Number(itemId));
    if (!it) return;
    await withTx("buy", async (m) => {
      let cost = BigInt(it.price);
      if (it.tier > 0 && S.me && S.me.pickaxe) { const cur = itemsList().find((i) => i.tier === S.me.pickaxe); if (cur) cost = cost > BigInt(cur.price) ? cost - BigInt(cur.price) : 0n; }
      const bal = await new ethers.Contract(ARCIRCLE, ERC20, state.signer).balanceOf(state.account);
      if (bal < cost) throw new Error("Not enough $ARCIRCLE for that.");
      if (cost > 0n) await approveIf(ARCIRCLE, cost);
      const tx = await m.buyItem(it.id, it.tier > 0 ? 0 : S.id);
      toast("Burning $ARCIRCLE…"); await tx.wait();
      Scene.share("gold");
      toast(it.tier > 0 ? "New pickaxe! It works in every mine." : "Boost lit.");
    });
  }
  async function claim() {
    const me = S.me;
    if (!me || !me.claimable || !me.claimable.proof) return;
    await withTx("claim", async (m) => {
      const tx = await m.claim(S.id, state.account, me.claimable.cumulative, me.claimable.proof);
      toast("Claiming…"); await tx.wait();
      if (typeof window.arcConfetti === "function" && !reduce) window.arcConfetti({ count: 120 });
      toast("Claimed. Share your card on X!");
    });
  }
  async function burnCall(which) {
    await withTx("burn", async (m) => { const tx = which === 1 ? await m.burnUnmined(S.id) : await m.burnUnclaimed(S.id); toast("Burning…"); await tx.wait(); toast("Burned."); });
  }
  async function verifyX(url) {
    const msg = $("bm-xmsg");
    if (msg) msg.textContent = tr("Checking your post…");
    try {
      const token = await ensureSession();
      const j = await post(`xpost=${S.id}`, { w: String(state.account).toLowerCase(), s: token, url });
      if (j.error) { if (msg) msg.textContent = tr(j.error); return; }
      toast(j.first ? "Post verified — claiming is unlocked." : `Post verified: +${j.bonusPct}%`);
      if (typeof window.arcConfetti === "function" && !reduce) window.arcConfetti({ count: 60 });
      await refresh();
    } catch (e) { if (msg) msg.textContent = String(e.message || e); }
  }

  // ---------------- open a mine ----------------
  function openModal() {
    if (!S.live) { toast("Opening mines starts when the contract is live on Arc."); }
    const box = document.createElement("div");
    box.className = "bm-modal-back";
    box.innerHTML = `<div class="bm-modal" role="dialog" aria-modal="true" aria-labelledby="bm-open-h">
      <button type="button" class="bm-x" data-close aria-label="${T("Close")}">×</button>
      <h2 id="bm-open-h">${T("Open a mine")}</h2>
      <p class="bm-note">${T("Put part of your token's supply in the ground. Builders dig it over the days you pick; what nobody digs is burned. You can't take it back.")}</p>
      <form id="bm-open-f" autocomplete="off">
        <label>${T("Token")}<input id="bm-o-tok" placeholder="0x…" spellcheck="false" required></label>
        <span class="bm-sm" id="bm-o-info"></span>
        <label>${T("Amount")}<input id="bm-o-amt" inputmode="decimal" placeholder="0" required></label>
        <div class="bm-row" id="bm-o-pct">${[5, 10, 20].map((p) => `<button type="button" class="bm-mini" data-pct="${p}">${p}%</button>`).join("")}<span class="bm-sm">${T("of your balance")}</span></div>
        <label>${T("Runs for")}<select id="bm-o-days">${[3, 7, 14, 30, 60].map((d) => `<option value="${d}" ${d === 14 ? "selected" : ""}>${d} ${T("days")}</option>`).join("")}</select></label>
        <label>${T("Opens")}<select id="bm-o-delay"><option value="0">${T("Now")}</option><option value="3600">${T("In 1 hour")}</option><option value="86400">${T("In 24 hours")}</option></select></label>
        <div class="bm-o-sum" id="bm-o-sum"></div>
        <label class="bm-check"><input type="checkbox" id="bm-o-ok" required> <span>${T("I understand the deposit can't come back: it's mined by builders or burned.")}</span></label>
        <button type="submit" class="bm-go small">${T("Open the mine")}</button>
      </form></div>`;
    document.body.appendChild(box);
    const close = () => box.remove();
    box.addEventListener("click", (e) => { if (e.target === box || e.target.closest("[data-close]")) close(); const p = e.target.closest("[data-pct]"); if (p) pct(Number(p.dataset.pct)); });
    const tok = box.querySelector("#bm-o-tok"), amt = box.querySelector("#bm-o-amt"), info = box.querySelector("#bm-o-info");
    let meta = null;
    const sum = () => {
      const a = Number(amt.value || 0), d = Number(box.querySelector("#bm-o-days").value);
      box.querySelector("#bm-o-sum").innerHTML = meta && a > 0 ? `<b>${T("Layer 1 releases")} ${compact(a * 32 / 63)} $${esc(meta.symbol)}</b> ${T("in the first")} ${dur((d * 86400) / 6)}, ${T("then half as much each layer.")}` : "";
    };
    const load = async () => {
      meta = null; info.textContent = "";
      if (!isAddr(tok.value)) return;
      try {
        const rp = state.signer || (typeof readProvider === "function" ? readProvider() : null);
        const c = new ethers.Contract(tok.value.trim(), ERC20, rp);
        const [sym, dec, bal] = await Promise.all([c.symbol(), c.decimals(), state.account ? c.balanceOf(state.account) : 0n]);
        meta = { symbol: sym, decimals: Number(dec), bal };
        info.innerHTML = `$${esc(sym)} · ${T("your balance")} <b data-no-i18n>${compact(units(bal, Number(dec)))}</b>`;
      } catch (e) { info.textContent = tr("That isn't an ERC-20 token on Arc."); }
      sum();
    };
    const pct = (p) => { if (!meta) return; amt.value = ethers.formatUnits((BigInt(meta.bal) * BigInt(p)) / 100n, meta.decimals); sum(); };
    tok.addEventListener("change", load); tok.addEventListener("input", () => { if (isAddr(tok.value)) load(); });
    amt.addEventListener("input", sum); box.querySelector("#bm-o-days").addEventListener("change", sum);
    box.querySelector("#bm-open-f").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!meta) { toast("Pick a token first."); return; }
      let raw; try { raw = ethers.parseUnits(String(amt.value || "0"), meta.decimals); } catch (er) { toast("That amount isn't a number."); return; }
      if (raw <= 0n) { toast("Enter an amount."); return; }
      await withTx("open", async (m) => {
        await approveIf(tok.value.trim(), raw);
        const tx = await m.openMine(tok.value.trim(), raw, Number(box.querySelector("#bm-o-days").value), Number(box.querySelector("#bm-o-delay").value));
        toast("Opening the mine…"); await tx.wait();
        close();
        if (typeof window.arcConfetti === "function" && !reduce) window.arcConfetti({ count: 140 });
        toast("Your mine is open. Share it so builders find it.");
        S.id = null;
      });
    });
    tok.focus();
  }

  // =====================================================================================
  // events
  // =====================================================================================
  function onClick(e) {
    const mc = e.target.closest("[data-mine]");
    if (mc) { const id = mc.dataset.mine; if (S.mining) stopMining(); S.id = id === "practice" ? "practice" : Number(id); S.local = { shares: 0, gold: 0, diamond: 0, dug: S.local.dug }; setHash(); Scene.set({ jump: true }); refresh(); return; }
    const tb = e.target.closest("#bm-tabs [data-tab]");
    if (tb) { S.tab = tb.dataset.tab; paintTabs(); return; }
    const pw = e.target.closest("[data-power]");
    if (pw) { S.power = Number(pw.dataset.power); paintPower(); if (S.mining) { stopMining(); startMining(); } return; }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    const act = a.dataset.act;
    if (act === "open") openModal();
    else if (act === "connect") { if (typeof connectWallet === "function") connectWallet().then(() => refresh()); }
    else if (act === "join") join();
    else if (act === "buy") buy(a.dataset.item);
    else if (act === "claim") claim();
    else if (act === "burn1") burnCall(1);
    else if (act === "burn2") burnCall(2);
    else if (act === "tab") { S.tab = a.dataset.tab; paintTabs(); $("bm-tabs").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }
    else if (act === "copy") { navigator.clipboard && navigator.clipboard.writeText(a.dataset.copy).then(() => toast("Link copied.")); }
  }
  function onSubmit(e) {
    if (e.target.id === "bm-xform") { e.preventDefault(); const u = $("bm-xurl"); if (u && u.value.trim()) verifyX(u.value.trim()); }
  }
  function onInput() { /* reserved */ }
  function setHash() {
    if (!history.replaceState || !/^#mine/.test(location.hash) && location.hash) return;
    const want = S.id === "practice" || S.id == null ? "#mine" : `#mine?id=${S.id}`;
    if (location.hash !== want) history.replaceState(null, "", location.pathname + location.search + want);
  }
  function readHash() {
    const m = /^#mine(?:\?(.*))?$/.exec(location.hash);
    if (!m) return;
    const q = new URLSearchParams(m[1] || "");
    if (/^\d{1,6}$/.test(q.get("id") || "")) S.id = Number(q.get("id"));
    const r = (q.get("r") || "").toLowerCase();
    if (isAddr(r) && S.id != null && S.id !== "practice") lsSet(`bm.ref.${S.id}`, r);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && S.mining) { S.pausedByHide = true; stopMining(); toast("Mining paused while this tab is hidden."); }
    else if (!document.hidden && S.pausedByHide) { S.pausedByHide = false; startMining(); }
  });

  function show() {
    if (!S.booted) { S.booted = true; frame(); readHash(); refresh(true); }
    else { readHash(); refresh(); }
    Scene.size(); Scene.start();
    clearInterval(S.pollTimer);
    S.pollTimer = setInterval(() => { if (!document.hidden && panel.classList.contains("active")) refresh(); }, 20000);
  }
  function hide() { Scene.stop(); clearInterval(S.pollTimer); }
  window.addEventListener("resize", () => { if (S.booted) Scene.size(); });
  document.addEventListener("arcpad:tab", (e) => { if (e.detail && e.detail.tab === "mine") show(); else { hide(); if (S.mining) stopMining(); } });
  document.addEventListener("arc:lang", () => { if (S.booted) { frame(); paintAll(); } });
  // a wallet connected, switched or left: pick up the builder's view (and stop mining for the old one)
  let lastAcct = null;
  setInterval(() => {
    const a = (typeof state !== "undefined" && state.account) || null;
    if (a === lastAcct) return;
    lastAcct = a;
    if (!S.booted) return;
    if (S.mining && S.id !== "practice") stopMining();
    S.sess = null;
    if (panel.classList.contains("active")) refresh();
  }, 1500);
  if (panel.classList.contains("active")) show();
  window.arcMine = { scene: Scene, state: S, refresh };
})();
