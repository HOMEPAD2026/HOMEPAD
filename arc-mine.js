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
  // layer colours under the block textures: Grass, Dirt, Stone, Ore, Deep Rock, Bedrock
  const LAYER_COL = [["#6f8f3f", "#5b4630"], ["#8a5a36", "#5e3b22"], ["#7b808a", "#555a64"], ["#4a4650", "#2e2b33"], ["#5a2630", "#35141b"], ["#3b3e45", "#1f2126"]];
  const LAYER_TEX = ["grass", "dirt", "stone", "ore", "deep", "bedrock"];
  const TEX_OF = ["dirt", "dirt", "stone", "ore", "deep", "bedrock"]; // the grass layer is dirt under its green top
  const ORE_COL = { copper: "#ff9a4d", silver: "#e6ecf5", gold: "#ffd35c", diamond: "#7ff6ff", arc: "#c38bff" };
  const DEFAULT_GAME = {
    epoch: 3600, shareBits: 21, cap: 600, batchEvery: 12, minGap: 8, maxBatch: 60, bonusCap: 100,
    ores: [{ kind: "copper", name: "Copper", extra: 2, pts: 1 }, { kind: "silver", name: "Silver", extra: 4, pts: 2 }, { kind: "gold", name: "Gold", extra: 6, pts: 10 }, { kind: "diamond", name: "Diamond", extra: 10, pts: 60 }, { kind: "arc", name: "Arc Crystal", extra: 14, pts: 500 }],
    layers: ["Grass", "Dirt", "Stone", "Ore", "Deep Rock", "Bedrock"], layerParts: [32, 16, 8, 4, 2, 1],
    pickaxes: [{ tier: 0, id: "wood", name: "Wood pickaxe", mult: 1 }, { tier: 1, id: "stone", name: "Stone pickaxe", mult: 1.25 }, { tier: 2, id: "iron", name: "Iron pickaxe", mult: 1.6 }, { tier: 3, id: "diamond", name: "Diamond pickaxe", mult: 2.1 }, { tier: 4, id: "arcane", name: "Arcane pickaxe", mult: 2.6 }],
    ranks: [{ id: "apprentice", name: "Apprentice", min: 0, pct: 0 }, { id: "miner", name: "Miner", min: 1000, pct: 2 }, { id: "foreman", name: "Foreman", min: 10000, pct: 4 }, { id: "architect", name: "Architect", min: 50000, pct: 6 }, { id: "legend", name: "Legend", min: 200000, pct: 10 }],
    characters: [{ id: "apprentice", name: "Apprentice", rank: 0 }, { id: "explorer", name: "Explorer", rank: 0 }, { id: "engineer", name: "Engineer", rank: 1 }, { id: "foreman", name: "Foreman", rank: 2 }, { id: "architect", name: "Architect", rank: 3 }],
    pets: [{ id: "arccat", name: "Arc Cat", rank: 0 }, { id: "arcia", name: "ARCIA", rank: 1 }, { id: "mole", name: "Mole", rank: 2 }, { id: "picko", name: "Picko", rank: 3 }, { id: "orego", name: "Orego", rank: 4 }],
    boosts: [{ kind: 1, name: "Lantern", effect: "+15% for 24 h", pct: 15 }, { kind: 2, name: "Dynamite", effect: "+50% for 1 h", pct: 50 }, { kind: 3, name: "Lucky charm", effect: "rare ores twice as often for 24 h", pct: 0 }, { kind: 4, name: "Overtime", effect: "+50% hourly cap for 24 h", pct: 0 }],
    holder: [[100000, 10], [1000000, 20], [5000000, 30]], postPct: 5, postMax: 5, refPct: 5, refMax: 5, referredPct: 5, streakPct: 2, streakMax: 10, streakMin: 30,
    items: [[50000, 1, 0, 0], [200000, 2, 0, 0], [800000, 3, 0, 0], [2500000, 4, 0, 0], [30000, 0, 1, 86400], [20000, 0, 2, 3600], [40000, 0, 3, 86400], [30000, 0, 4, 86400]],
  };
  // the art (images/mine/, cut from the Builder Mine concept sheet)
  const ART = "/images/mine/";
  const IMG = {};
  const img = (k) => { if (!IMG[k]) { const i = new Image(); i.decoding = "async"; i.src = ART + k + ".webp"; IMG[k] = i; } return IMG[k]; };
  const ok = (i) => i && i.complete && i.naturalWidth > 0;
  const src = (k) => ART + k + ".webp";
  function preload() {
    ["char-apprentice", "char-explorer", "char-engineer", "char-foreman", "char-architect", "act-1", "act-2", "act-3",
      "pet-arccat", "pet-arcia", "pet-mole", "pet-picko", "pet-orego", "ore-copper", "ore-silver", "ore-gold", "ore-diamond", "ore-arc",
      "block-grass", "block-dirt", "block-stone", "block-ore", "block-deep", "block-bedrock", ...TEX_OF.map((t) => "tex-" + t)].forEach(img);
  }
  const S = {
    booted: false, cfg: null, G: DEFAULT_GAME, list: [], id: null, view: null, me: null, tab: "builder",
    live: false, address: "", practice: false,
    sess: null, mining: false, workers: [], rates: {}, queue: [], work: null, power: Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1)),
    local: { shares: 0, ores: {}, dug: 0 }, subTimer: 0, pollTimer: 0, clock: 0, busy: false, capHit: false,
  };
  const G = () => S.G;
  try { S.look = JSON.parse(lsGet("bm.look") || "null"); } catch (e) { S.look = null; }
  const mineAddr = () => S.address || ((typeof CONFIG !== "undefined" && isAddr(CONFIG.BUILDER_MINE_ADDRESS)) ? CONFIG.BUILDER_MINE_ADDRESS : "");
  const api = async (q, opt) => { const r = await fetch(`/api/mine?${q}`, { cache: "no-store", ...(opt || {}) }); const j = await r.json().catch(() => ({})); if (!r.ok && !j.error) j.error = `HTTP ${r.status}`; j._status = r.status; return j; };
  const post = (q, body) => api(q, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  // =====================================================================================
  // the scene: a cross-section of the mine, the builder at the rock face, particles
  // =====================================================================================
  const Scene = (() => {
    let cv = null, cx = null, W = 0, H = 0, dpr = 1, raf = 0, last = 0, on = false;
    const LH = 360, SURF = 190;                      // layer height, sky above the surface (world px)
    let depth = 0.06, targetDepth = 0.06, t = 0, swingT = 1, hitAt = -9, shake = 0, flash = 0, flashCol = "#fff", crack = 0, petJump = 0, jackpot = 0;
    let parts = [], floats = [], pops = [], idle = true, label = "", layerNames = DEFAULT_GAME.layers, look = { char: "apprentice", pet: "arccat" };
    let rocks = null, pats = {};
    const rnd = (() => { let s = 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    function makeRocks() {
      rocks = [];
      const kinds = ["copper", "copper", "silver", "gold", "diamond", "arc"];
      for (let l = 0; l < 6; l++) for (let i = 0; i < 14; i++) {
        const deep = l / 5, r = rnd();
        const ore = r < 0.28 ? kinds[Math.min(5, Math.floor(rnd() * (2 + l * 0.9)))] : "";
        rocks.push({ l, x: rnd(), y: rnd(), s: 12 + rnd() * 14 + deep * 6, a: rnd() * 6.28, ore, b: rnd() < 0.08 ? LAYER_TEX[l] : "" });
      }
    }
    function size() {
      if (!cv) return;
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(280, r.width); H = Math.max(240, r.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.imageSmoothingQuality = "high";
      pats = {};
    }
    function mount(c) { cv = c; cx = c.getContext("2d"); if (!rocks) makeRocks(); preload(); size(); }
    const worldY = () => SURF + depth * LH * 6;
    function start() { if (on || !cv) return; on = true; last = performance.now(); raf = requestAnimationFrame(loop); }
    function stop() { on = false; cancelAnimationFrame(raf); }
    function loop(ts) {
      if (!on) return;
      const dt = Math.min(0.05, (ts - last) / 1000); last = ts; t += dt;
      step(dt); draw();
      raf = requestAnimationFrame(loop);
    }
    // the builder's spot, size and the rock face in front (screen px)
    const geo = () => { const mob = W < 520, ch = Math.min(H * 0.42, mob ? 150 : 210), bx = W * (mob ? 0.52 : 0.56), fy = H * (mob ? 0.6 : 0.72); return { mob, ch, bx, fy, fx: bx + ch * 0.42, gh: ch * 1.18 }; };
    function face() { const g = geo(); return { x: g.fx + 6, y: g.fy - g.ch * 0.45 }; }
    function step(dt) {
      depth += (targetDepth - depth) * Math.min(1, dt * 1.5);
      if (!idle) { swingT += dt * 1.15; if (swingT >= 1) { swingT = 0; } if (swingT > 0.55 && swingT - dt * 1.15 <= 0.55) { chips(4, 0.7); crack = Math.min(1, crack + 0.03); } }
      shake = Math.max(0, shake - dt * 2.4); flash = Math.max(0, flash - dt * 2); petJump = Math.max(0, petJump - dt * 2.2); jackpot = Math.max(0, jackpot - dt * 0.45);
      for (const p of parts) { p.vy += (p.g == null ? 900 : p.g) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.rot += p.vr * dt; }
      parts = parts.filter((p) => p.life > 0);
      for (const f of floats) { f.y -= 40 * dt; f.life -= dt; }
      floats = floats.filter((f) => f.life > 0);
      for (const o of pops) { o.t += dt; }
      pops = pops.filter((o) => o.t < o.dur);
    }
    function layerIdx() { return Math.min(5, Math.floor(depth * 6)); }
    function chips(n, force = 1, col) {
      if (reduce) n = Math.min(n, 3);
      const f = face(), L = LAYER_COL[layerIdx()];
      for (let i = 0; i < n; i++) parts.push({ x: f.x, y: f.y + (Math.random() - 0.5) * 40, vx: -40 - Math.random() * 240 * force, vy: -140 - Math.random() * 280 * force, life: 0.7 + Math.random() * 0.7, s: 3 + Math.random() * 5 * force, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, col: col || L[Math.random() < 0.5 ? 0 : 1] });
    }
    function sparkle(n, col) {
      const f = face();
      for (let i = 0; i < (reduce ? Math.min(n, 8) : n); i++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 300; parts.push({ x: f.x - 10, y: f.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 140, life: 0.8 + Math.random() * 0.9, s: 2 + Math.random() * 3.5, rot: 0, vr: 0, col, star: true, g: 360 }); }
    }
    function float(text, col, big) { const f = face(), k = floats.filter((x) => x.big).length; floats.push({ x: f.x - 50 + (Math.random() - 0.5) * 40, y: f.y - 60 - (big ? k * 28 : 0), text, col, life: big ? 2.2 : 1.1, big }); }
    const ORE_FX = { copper: [4, 0.2, 0.15], silver: [10, 0.3, 0.2], gold: [24, 0.6, 0.35], diamond: [48, 1, 0.6], arc: [90, 1.4, 1] };
    function share(kind) {
      swingT = 0.5; hitAt = t; crack = Math.min(1, crack + 0.1);
      const o = (G().ores || []).find((x) => x.kind === kind);
      if (o) {
        const [n, sh, fl] = ORE_FX[kind] || [8, 0.3, 0.2];
        chips(8 + n / 4, 1.1); sparkle(n, ORE_COL[kind]);
        pops.push({ kind, t: 0, dur: kind === "arc" ? 2.6 : 1.5, x0: face().x - 8, y0: face().y });
        float(`${tr(o.name).toUpperCase()} +${o.pts}`, ORE_COL[kind], kind !== "copper");
        shake = reduce ? 0 : sh; flash = fl * 0.6; flashCol = ORE_COL[kind]; petJump = kind === "copper" ? 0.4 : 1;
        if (kind === "arc") { jackpot = 1; flash = 0.9; }
        if (kind !== "copper" && kind !== "silver") crack = 0;
      } else { chips(7, 0.9); float("+1", "#eaf2e6"); if (crack >= 1) { crack = 0; chips(16, 1.2); } }
    }
    // ---- drawing ----
    function roundRect(x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
    function pattern(l) {
      if (pats[l]) return pats[l];
      const im = img("tex-" + TEX_OF[l]);
      if (!ok(im)) return null;
      const c = document.createElement("canvas"); c.width = 64; c.height = 64;
      const g = c.getContext("2d"); g.drawImage(im, 0, 0, 64, 64);
      return (pats[l] = cx.createPattern(c, "repeat"));
    }
    function drawImg(k, x, y, h, opt = {}) {
      const im = img(k);
      if (!ok(im)) return false;
      const w = (h * im.naturalWidth) / im.naturalHeight;
      cx.save(); cx.translate(x, y);
      if (opt.rot) cx.rotate(opt.rot);
      if (opt.flip) cx.scale(-1, 1);
      if (opt.sx || opt.sy) cx.scale(opt.sx || 1, opt.sy || 1);
      if (opt.alpha != null) cx.globalAlpha = opt.alpha;
      if (opt.glow) { cx.shadowColor = opt.glow; cx.shadowBlur = opt.blur || 18; }
      cx.drawImage(im, -w * (opt.ax == null ? 0.5 : opt.ax), -h * (opt.ay == null ? 1 : opt.ay), w, h);
      cx.restore();
      return true;
    }
    function draw() {
      if (!cx) return;
      const sx = shake ? (Math.random() - 0.5) * 16 * shake : 0, sy = shake ? (Math.random() - 0.5) * 12 * shake : 0;
      const gg = geo(), camY = worldY() - gg.fy;
      cx.save(); cx.clearRect(0, 0, W, H); cx.translate(sx, sy);
      // night sky over the headframe
      const skyB = SURF - camY;
      if (skyB > 0) {
        const g = cx.createLinearGradient(0, skyB - SURF, 0, skyB); g.addColorStop(0, "#0b1030"); g.addColorStop(0.7, "#241a4a"); g.addColorStop(1, "#3a2a5c");
        cx.fillStyle = g; cx.fillRect(0, 0, W, skyB);
        cx.fillStyle = "#fff"; for (let i = 0; i < 30; i++) { const x = (i * 97.3) % W, y = ((i * 53.1) % Math.max(1, skyB - 40)); cx.globalAlpha = 0.25 + 0.35 * Math.sin(t * 1.3 + i); cx.fillRect(x, y, 1.8, 1.8); } cx.globalAlpha = 1;
        // far crystals glowing on the ridge
        for (let i = 0; i < 6; i++) { const x = ((i * 211) % W), hgt = 18 + (i * 7) % 20; cx.fillStyle = i % 2 ? "rgba(140,110,255,.55)" : "rgba(80,170,255,.5)"; cx.beginPath(); cx.moveTo(x, skyB); cx.lineTo(x + 6, skyB - hgt); cx.lineTo(x + 12, skyB); cx.fill(); }
        const hx = W * (gg.mob ? 0.2 : 0.28);
        cx.strokeStyle = "#8a6a45"; cx.lineWidth = 4;
        cx.beginPath(); cx.moveTo(hx - 36, skyB); cx.lineTo(hx, skyB - 96); cx.lineTo(hx + 36, skyB); cx.moveTo(hx - 24, skyB - 34); cx.lineTo(hx + 24, skyB - 34); cx.moveTo(hx - 13, skyB - 66); cx.lineTo(hx + 13, skyB - 66); cx.stroke();
        cx.fillStyle = "#ffc861"; cx.beginPath(); cx.arc(hx, skyB - 96, 10, 0, 6.28); cx.fill();
        cx.strokeStyle = "rgba(255,200,97,.5)"; cx.lineWidth = 2; cx.beginPath(); cx.arc(hx, skyB - 96, 14 + 3 * Math.sin(t * 3), 0, 6.28); cx.stroke();
        // lantern posts along the surface
        for (let i = 0; i < 3; i++) { const lx = W * (0.5 + i * 0.2); cx.fillStyle = "#4a3624"; cx.fillRect(lx, skyB - 42, 4, 42); const lg = cx.createRadialGradient(lx + 2, skyB - 46, 1, lx + 2, skyB - 46, 26); lg.addColorStop(0, `rgba(255,200,110,${0.8 + 0.1 * Math.sin(t * 5 + i)})`); lg.addColorStop(1, "rgba(255,200,110,0)"); cx.fillStyle = lg; cx.fillRect(lx - 24, skyB - 72, 52, 52); }
        cx.fillStyle = "#fff"; cx.font = "800 14px Sora, Inter, sans-serif"; cx.textAlign = "left"; if (label) { cx.shadowColor = "rgba(0,0,0,.6)"; cx.shadowBlur = 6; cx.fillText(label, hx + 46, skyB - 74); cx.shadowBlur = 0; }
      }
      // strata: colour + the concept's block texture + embedded ores and blocks
      for (let l = 0; l < 6; l++) {
        const top = SURF + l * LH - camY, bot = top + LH;
        if (bot < 0 || top > H) continue;
        const g = cx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, LAYER_COL[l][0]); g.addColorStop(1, LAYER_COL[l][1]);
        cx.fillStyle = g; cx.fillRect(0, top, W, LH);
        const pt = pattern(l);
        if (pt) { cx.save(); cx.globalAlpha = 0.42; cx.translate(0, top); cx.fillStyle = pt; cx.fillRect(0, 0, W, LH); cx.restore(); }
        if (l === 0) { cx.fillStyle = "#86c94f"; cx.fillRect(0, top, W, 12); cx.fillStyle = "#5d9a36"; for (let x = 0; x < W; x += 8) cx.fillRect(x, top + 10, 5, 4 + ((x * 7) % 6)); }
        cx.fillStyle = "rgba(0,0,0,.35)"; cx.fillRect(0, top, W, 4);
        for (const r of rocks) if (r.l === l) {
          const x = r.x * W, y = top + 26 + r.y * (LH - 52);
          if (r.b) drawImg("block-" + r.b, x, y, r.s * 1.8, { ay: 0.5, alpha: 0.9 });
          else if (r.ore) { const gl = 0.5 + 0.5 * Math.sin(t * 2.2 + r.a * 3); drawImg("ore-" + r.ore, x, y, r.s * 1.2, { ay: 0.5, rot: r.a * 0.3 - 0.4, glow: ORE_COL[r.ore], blur: 6 + gl * 12, alpha: 0.75 + 0.25 * gl }); }
        }
        cx.save(); cx.font = "800 12px Sora, Inter, sans-serif"; cx.textAlign = "left"; cx.shadowColor = "rgba(0,0,0,.7)"; cx.shadowBlur = 4;
        drawImg("block-" + LAYER_TEX[l], 26, top + 44, 30, { ay: 0.5 });
        cx.fillStyle = "#fff"; cx.fillText(`${l + 1} · ${tr(layerNames[l] || "")}`, 46, top + 38);
        cx.fillStyle = "rgba(255,255,255,.7)"; cx.font = "700 11px Inter, sans-serif"; cx.fillText(`${G().layerParts[l]}/63 ${tr("of the mine")}`, 46, top + 54);
        cx.restore();
      }
      // the shaft, the gallery, rails, props, a cart of what's been dug
      const fy = gg.fy, sxh = W * (gg.mob ? 0.2 : 0.28), top0 = Math.max(0, SURF - camY), gtop = fy - gg.gh;
      cx.fillStyle = "rgba(10,10,16,.9)";
      cx.fillRect(sxh - 24, top0, 48, fy - top0 + 4);
      roundRect(sxh - 24, gtop, gg.fx - sxh + 28, gg.gh + 6, 22); cx.fill();
      const inner = cx.createLinearGradient(0, gtop, 0, fy); inner.addColorStop(0, "rgba(60,40,90,.35)"); inner.addColorStop(1, "rgba(0,0,0,0)"); cx.fillStyle = inner; roundRect(sxh - 24, gtop, gg.fx - sxh + 28, gg.gh + 6, 22); cx.fill();
      cx.strokeStyle = "rgba(170,120,70,.8)"; cx.lineWidth = 3;
      for (let y = top0 + ((camY % 22) + 22) % 22; y < gtop + 6; y += 22) { cx.beginPath(); cx.moveTo(sxh - 13, y); cx.lineTo(sxh + 13, y); cx.stroke(); }
      cx.beginPath(); cx.moveTo(sxh - 13, top0); cx.lineTo(sxh - 13, gtop + 8); cx.moveTo(sxh + 13, top0); cx.lineTo(sxh + 13, gtop + 8); cx.stroke();
      cx.strokeStyle = "rgba(170,180,195,.6)"; cx.lineWidth = 2.5; cx.beginPath(); cx.moveTo(sxh + 22, fy - 2); cx.lineTo(gg.fx - 4, fy - 2); cx.stroke();
      cx.fillStyle = "#6b4a2b"; for (let x = sxh + 50; x < gg.bx - gg.ch * 0.55; x += 70) { cx.fillRect(x, gtop, 8, gg.gh + 6); cx.fillRect(x - 7, gtop - 4, 22, 8); }
      for (let x = sxh + 60; x < gg.fx - 30; x += 140) { const lg = cx.createRadialGradient(x, gtop + 16, 1, x, gtop + 16, 40); lg.addColorStop(0, "rgba(255,190,100,.55)"); lg.addColorStop(1, "rgba(255,190,100,0)"); cx.fillStyle = lg; cx.fillRect(x - 40, gtop - 24, 80, 80); cx.fillStyle = "#ffcf7a"; cx.fillRect(x - 3, gtop + 10, 6, 9); }
      const cartX = sxh + 30, cw = Math.min(70, gg.ch * 0.4);
      if (cartX + cw < gg.bx - gg.ch * 0.5) {
        cx.fillStyle = "#5a3d24"; roundRect(cartX, fy - cw * 0.5, cw, cw * 0.36, 5); cx.fill(); cx.strokeStyle = "#8a6a45"; cx.lineWidth = 2; cx.stroke();
        for (let i = 0; i < 4; i++) drawImg(["ore-copper", "ore-gold", "ore-diamond", "ore-silver"][i], cartX + 10 + i * (cw - 20) / 3, fy - cw * 0.46, cw * 0.32, { ay: 0.7 });
        cx.fillStyle = "#15181d"; cx.beginPath(); cx.arc(cartX + cw * 0.22, fy - 6, 6, 0, 6.28); cx.arc(cartX + cw * 0.78, fy - 6, 6, 0, 6.28); cx.fill();
      }
      // the rock face (its layer's block texture), cracking as it's hit
      const f = face(), L = layerIdx();
      cx.save(); roundRect(gg.fx - 2, gtop - 4, 56, gg.gh + 10, 12); cx.clip();
      cx.fillStyle = LAYER_COL[L][1]; cx.fillRect(gg.fx - 2, gtop - 4, 56, gg.gh + 10);
      const pt = pattern(L); if (pt) { cx.fillStyle = pt; cx.globalAlpha = 0.9; cx.fillRect(gg.fx - 2, gtop - 4, 56, gg.gh + 10); cx.globalAlpha = 1; }
      cx.restore();
      cx.strokeStyle = `rgba(0,0,0,${0.35 + crack * 0.45})`; cx.lineWidth = 2.5; cx.beginPath();
      const n = 1 + Math.floor(crack * 6); for (let i = 0; i < n; i++) { const yy = gtop + 10 + i * (gg.gh / 7); cx.moveTo(f.x, yy); cx.lineTo(f.x + 14, yy + 8); cx.lineTo(f.x + 6, yy + 15); } cx.stroke();
      if (t - hitAt < 0.25) { const k = 1 - (t - hitAt) / 0.25; cx.strokeStyle = `rgba(255,240,200,${k})`; cx.lineWidth = 3; cx.beginPath(); cx.arc(f.x, f.y, 10 + 30 * (1 - k), 0, 6.28); cx.stroke(); }
      // headlamp light cone
      const lx = gg.bx + gg.ch * 0.12, ly = fy - gg.ch * 0.86;
      const lg = cx.createRadialGradient(lx, ly, 4, lx + 40, ly + 20, gg.ch * 1.1);
      lg.addColorStop(0, `rgba(255,236,170,${0.36 + 0.05 * Math.sin(t * 9)})`); lg.addColorStop(1, "rgba(255,236,170,0)");
      cx.fillStyle = lg; cx.beginPath(); cx.moveTo(lx, ly); cx.lineTo(lx + gg.ch * 1.2, ly - gg.ch * 0.3); cx.lineTo(lx + gg.ch * 1.2, ly + gg.ch * 0.8); cx.closePath(); cx.fill();
      drawPet(gg); drawBuilder(gg);
      // ores flying out of the rock
      for (const o of pops) {
        const k = o.t / o.dur, e = 1 - Math.pow(1 - Math.min(1, k * 1.6), 3);
        const x = o.x0 - 60 * e, y = o.y0 - (gg.ch * 0.9) * e + 40 * Math.max(0, k - 0.6);
        const sz = (o.kind === "arc" ? 90 : o.kind === "diamond" ? 70 : 54) * (0.6 + 0.4 * Math.sin(Math.min(1, k * 3) * 1.57));
        drawImg("ore-" + o.kind, x, y, sz, { ay: 0.5, glow: ORE_COL[o.kind], blur: 26, alpha: k > 0.8 ? (1 - k) * 5 : 1, rot: Math.sin(t * 6) * 0.1 });
      }
      for (const p of parts) {
        cx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6)); cx.fillStyle = p.col;
        if (p.star) { cx.beginPath(); cx.arc(p.x, p.y, p.s, 0, 6.28); cx.fill(); }
        else { cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); cx.restore(); }
      }
      cx.globalAlpha = 1;
      for (const fl of floats) {
        cx.globalAlpha = Math.max(0, Math.min(1, fl.life));
        cx.font = `900 ${fl.big ? 24 : 15}px Sora, Inter, sans-serif`; cx.textAlign = "center";
        cx.lineWidth = 5; cx.strokeStyle = "rgba(0,0,0,.65)"; cx.strokeText(fl.text, fl.x, fl.y); cx.fillStyle = fl.col; cx.fillText(fl.text, fl.x, fl.y);
      }
      cx.globalAlpha = 1;
      cx.restore();
      if (flash) { cx.fillStyle = flashCol; cx.globalAlpha = Math.min(0.45, flash); cx.fillRect(0, 0, W, H); cx.globalAlpha = 1; }
      if (jackpot) {
        cx.save(); cx.globalAlpha = Math.min(1, jackpot * 1.6);
        const r = cx.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, Math.max(W, H) * 0.6); r.addColorStop(0, "rgba(195,139,255,.55)"); r.addColorStop(1, "rgba(195,139,255,0)"); cx.fillStyle = r; cx.fillRect(0, 0, W, H);
        cx.translate(W / 2, H * 0.38); cx.rotate(t * 0.8); cx.fillStyle = "rgba(255,255,255,.12)"; for (let i = 0; i < 12; i++) { cx.rotate(Math.PI / 6); cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(-30, -Math.max(W, H)); cx.lineTo(30, -Math.max(W, H)); cx.fill(); }
        cx.restore(); cx.save(); cx.globalAlpha = Math.min(1, jackpot * 1.6);
        drawImg("ore-arc", W / 2, H * 0.38, Math.min(160, H * 0.4), { ay: 0.5, glow: "#c38bff", blur: 40, sx: 1 + 0.05 * Math.sin(t * 8), sy: 1 + 0.05 * Math.sin(t * 8) });
        cx.font = `900 ${gg.mob ? 26 : 38}px Sora, Inter, sans-serif`; cx.textAlign = "center"; cx.lineWidth = 7; cx.strokeStyle = "rgba(30,0,60,.8)"; cx.strokeText(tr("ARC CRYSTAL JACKPOT"), W / 2, H * 0.62); cx.fillStyle = "#f0e2ff"; cx.fillText(tr("ARC CRYSTAL JACKPOT"), W / 2, H * 0.62);
        cx.restore();
      }
      const v = cx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.78);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.5)"); cx.fillStyle = v; cx.fillRect(0, 0, W, H);
    }
    // the builder: the concept's own swing frames for the Apprentice, a lunge for everyone else
    function drawBuilder(gg) {
      const bob = idle ? Math.sin(t * 2.2) * 2 : 0;
      cx.save(); cx.fillStyle = "rgba(0,0,0,.4)"; cx.beginPath(); cx.ellipse(gg.bx, gg.fy - 2, gg.ch * 0.26, gg.ch * 0.05, 0, 0, 6.28); cx.fill(); cx.restore();
      const ph = idle ? -1 : swingT;
      if (look.char === "apprentice" && !idle && ok(img("act-1"))) {
        const k = ph < 0.45 ? "act-1" : ph < 0.7 ? "act-2" : "act-3";
        const lean = ph < 0.45 ? -0.04 : ph < 0.7 ? 0.1 : 0.03;
        drawImg(k, gg.bx, gg.fy, gg.ch * 0.92, { rot: lean });
        return;
      }
      // wind-up (lean back, stretch), strike (lunge forward, squash), recover
      let rot = 0, sx = 1, sy = 1, dx = 0;
      if (ph >= 0) {
        if (ph < 0.45) { const k = ph / 0.45; rot = -0.14 * k; sy = 1 + 0.05 * k; sx = 1 - 0.03 * k; dx = -6 * k; }
        else if (ph < 0.62) { const k = (ph - 0.45) / 0.17; rot = -0.14 + 0.34 * k; sy = 1.05 - 0.12 * k; sx = 0.97 + 0.08 * k; dx = -6 + 16 * k; }
        else { const k = (ph - 0.62) / 0.38; rot = 0.2 * (1 - k); sy = 0.93 + 0.07 * k; sx = 1.05 - 0.05 * k; dx = 10 * (1 - k); }
      }
      drawImg("char-" + look.char, gg.bx + dx, gg.fy + bob, gg.ch, { rot, sx, sy });
    }
    function drawPet(gg) {
      const hop = petJump ? Math.sin(petJump * Math.PI) * 26 : Math.abs(Math.sin(t * 2.6)) * 4;
      const px = gg.bx - gg.ch * 0.62, ph = gg.ch * 0.5;
      cx.save(); cx.fillStyle = "rgba(0,0,0,.35)"; cx.beginPath(); cx.ellipse(px, gg.fy - 2, ph * 0.34, ph * 0.08, 0, 0, 6.28); cx.fill(); cx.restore();
      drawImg("pet-" + look.pet, px, gg.fy - hop, ph, { glow: look.pet === "orego" || look.pet === "arcia" ? "#6fb6ff" : null, blur: 10 });
    }
    return {
      mount, start, stop, size, share, chips,
      set(o) {
        if (o.depth != null) targetDepth = Math.max(0.02, Math.min(0.985, o.depth));
        if (o.jump) depth = targetDepth;
        if (o.idle != null) { idle = o.idle; if (!idle && swingT >= 1) swingT = 0; }
        if (o.label != null) label = o.label;
        if (o.layers) layerNames = o.layers;
        if (o.look) look = { ...look, ...o.look };
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
    Scene.set({ depth: frac, look: myLook(), label: sym ? `$${sym}` : tr("Practice mine") });
    tl.innerHTML = `<b>${T("Layer")} ${layer + 1} · ${T(g.layers[layer])}</b><span>${esc(leftTxt)}</span>`;
    const hr = hashRate();
    const cap = me ? me.cap : g.cap;
    const shares = S.id === "practice" ? S.local.shares : me && me.hour ? me.hour.shares + S.queue.length : 0;
    trr.innerHTML = `<b data-no-i18n>${hr ? (hr >= 1e6 ? (hr / 1e6).toFixed(2) + " MH/s" : (hr / 1e3).toFixed(0) + " kH/s") : "— H/s"}</b>
      <span>${T("This hour")} <em data-no-i18n>${fmtN(Math.min(shares, cap))} / ${fmtN(cap)}</em></span>
      <span class="bm-capbar"><i style="width:${Math.min(100, (shares / Math.max(1, cap)) * 100).toFixed(1)}%"></i></span>`;
    const mult = me && me.weight ? me.weight.mult : 1;
    const pt = Math.min(g.pickaxes.length - 1, (me && me.pickaxe) || 0), pick = g.pickaxes[pt];
    const rk = g.ranks[myRank()] || g.ranks[0];
    const ores = S.id === "practice" ? S.local.ores : (me && me.hour && me.hour.ores) || {};
    bl.innerHTML = `<span class="bm-chip pk t${pt}"><img src="${src("pick-" + pick.id)}" alt="" width="20" height="20">${T(pick.name)}</span><span class="bm-chip mult" title="${T("Pickaxe × (1 + bonuses)")}">×${mult.toFixed(2)}</span>` +
      `<span class="bm-chip rk"><img src="${src("badge-" + rk.id)}" alt="" width="18" height="18">${T(rk.name)}</span>` +
      `<span class="bm-chip ores">${(g.ores || []).map((o) => `<i title="${T(o.name)}"><img src="${src("ore-" + o.kind)}" alt="${T(o.name)}" width="16" height="16"><b data-no-i18n>${fmtN(ores[o.kind] || 0)}</b></i>`).join("")}</span>` +
      (me && me.hour && me.hour.of ? `<span class="bm-chip">${T("Your share of this hour")} <b data-no-i18n>${((me.hour.points / Math.max(1, me.hour.of)) * 100).toFixed(1)}%</b></span>` : "");
    gauge.innerHTML = g.layers.map((n, i) => `<i class="${i < layer ? "past" : i === layer ? "now" : ""}" style="--c:${LAYER_COL[i][0]}"><span>${i + 1}</span></i>`).join("") + `<b style="top:${(frac * 100).toFixed(1)}%"></b>`;
    if (go) {
      const can = S.id === "practice" || (v && me && me.joined && now() >= v.start && now() < v.end);
      go.classList.toggle("on", S.mining);
      go.classList.toggle("off", !can && !S.mining);
      go.querySelector("b").textContent = tr(S.mining ? "Stop" : S.capHit ? "Hourly cap reached" : S.id === "practice" ? "Start mining" : !state.account ? "Connect to mine" : v && me && !me.joined ? "Join to mine" : "Start mining");
    }
  }

  // ---------------- tabs ----------------
  const TABS = [["builder", "Your builder"], ["rig", "Pickaxes"], ["boosts", "Boosts"], ["proof", "Post & invite"], ["board", "Leaderboard"], ["claim", "Claim"], ["how", "How it works"]];
  function paintTabs() {
    const el = $("bm-tabs");
    if (!el) return;
    el.innerHTML = TABS.map(([k, n]) => `<button type="button" role="tab" aria-selected="${S.tab === k}" class="${S.tab === k ? "on" : ""}" data-tab="${k}">${T(n)}</button>`).join("");
    const b = $("bm-tabbody");
    b.innerHTML = S.tab === "builder" ? tabBuilder() : S.tab === "rig" ? tabRig() : S.tab === "boosts" ? tabBoosts() : S.tab === "proof" ? tabProof() : S.tab === "board" ? tabBoard() : S.tab === "claim" ? tabClaim() : tabHow();
  }
  function itemsList() {
    const it = S.cfg && Array.isArray(S.cfg.items) && S.cfg.items.length ? S.cfg.items : G().items.map(([p, tier, boost, d], id) => ({ id, price: (BigInt(p) * 10n ** 18n).toString(), tier, boost, duration: d, active: true }));
    return it;
  }
  const arcAmt = (raw) => compact(units(raw, 18));
  // ---------------- your builder: character, pet, rank ----------------
  function myRank() { return (S.me && S.me.rank) || (S.bd && S.bd.rank) || 0; }
  function myLook() {
    const g = G(), r = myRank(), saved = S.look || {}, server = (S.me && S.me.look) || {};
    const c = g.characters.find((x) => x.id === saved.char && x.rank <= r) || g.characters.find((x) => x.id === server.char) || g.characters[0];
    const p = g.pets.find((x) => x.id === saved.pet && x.rank <= r) || g.pets.find((x) => x.id === server.pet) || g.pets[0];
    return { char: c.id, pet: p.id };
  }
  function lifetime() { return (S.me && S.me.lifetime) || 0; }
  function tabBuilder() {
    const g = G(), r = myRank(), lk = myLook(), pts = lifetime();
    const rk = g.ranks[r], nx = g.ranks[r + 1];
    const pct = nx ? Math.min(100, ((pts - rk.min) / (nx.min - rk.min)) * 100) : 100;
    const card = (x, kind, on) => { const lock = x.rank > r; return `<button type="button" class="bm-look ${on ? "on" : ""} ${lock ? "lock" : ""}" data-look="${kind}" data-id="${x.id}" ${lock ? `aria-disabled="true" title="${T("Unlocks at")} ${T(g.ranks[x.rank].name)}"` : ""}>
      <img src="${src(kind + "-" + x.id)}" alt="" loading="lazy"><b>${T(x.name)}</b>${lock ? `<em><img src="${src("badge-" + g.ranks[x.rank].id)}" alt="" width="14" height="14">${T(g.ranks[x.rank].name)}</em>` : ""}</button>`; };
    return `<div class="bm-builder">
      <div class="bm-bstage">
        <img class="bm-bchar" src="${src("char-" + lk.char)}" alt="${T((g.characters.find((x) => x.id === lk.char) || {}).name || "")}">
        <img class="bm-bpet" src="${src("pet-" + lk.pet)}" alt="">
        <div class="bm-brank"><img src="${src("badge-" + rk.id)}" alt="" width="48" height="48"><div><b>${T(rk.name)}</b><span data-no-i18n>${fmtN(pts)} ${T("pts")}${nx ? ` / ${fmtN(nx.min)}` : ""}</span><span class="bm-capbar"><i style="width:${pct.toFixed(1)}%"></i></span>${nx ? `<small>${T("Next")}: ${T(nx.name)} (+${nx.pct}%)</small>` : `<small>${T("Top rank")}</small>`}</div></div>
      </div>
      <div class="bm-bpick">
        <h3>${T("Characters")}</h3><div class="bm-looks">${g.characters.map((x) => card(x, "char", x.id === lk.char)).join("")}</div>
        <h3>${T("Pets & companions")}</h3><div class="bm-looks pets">${g.pets.map((x) => card(x, "pet", x.id === lk.pet)).join("")}</div>
        <p class="bm-note">${T("Looks only — they don't change your mining. Rank up with lifetime points to unlock more.")}</p>
      </div></div>`;
  }
  function pickLook(kind, id) {
    const g = G(), list = kind === "char" ? g.characters : g.pets, x = list.find((y) => y.id === id);
    if (!x) return;
    if (x.rank > myRank()) { toast(`${tr("Unlocks at")} ${tr(g.ranks[x.rank].name)} ${tr("rank")}.`); return; }
    S.look = { ...myLook(), [kind]: id };
    lsSet("bm.look", JSON.stringify(S.look));
    Scene.set({ look: S.look });
    paintTabs();
    saveLook();
  }
  async function saveLook() {
    if (!S.live || !state.account || !S.sess || !S.look) return;
    await post("look=1", { w: String(state.account).toLowerCase(), s: S.sess.token, char: S.look.char, pet: S.look.pet }).catch(() => null);
  }
  function tabRig() {
    const me = S.me || {}, have = me.pickaxe || 0, items = itemsList();
    const priceOf = (tier) => { const x = items.find((i) => i.tier === tier); return x ? BigInt(x.price) : 0n; };
    const cards = G().pickaxes.map((p) => {
      const owned = p.tier <= have, next = p.tier === have + 1;
      const cost = p.tier === 0 ? 0n : priceOf(p.tier) - (have > 0 ? priceOf(have) : 0n);
      const it = items.find((i) => i.tier === p.tier);
      return `<div class="bm-pick t${p.tier} ${owned ? "own" : ""} ${p.tier === have ? "cur" : ""}">
        <span class="bm-pick-art" aria-hidden="true"><img src="${src("pick-" + p.id)}" alt="" width="64" height="64" loading="lazy"></span>
        <b>${T(p.name)}</b><span class="bm-pick-x">×${p.mult.toFixed(2).replace(/0$/, "")}</span>
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
    const found = { gold: "found gold", diamond: "found a diamond", arc: "found an Arc Crystal" };
    const feed = (v.feed || []).map((f) => `<li class="k-${f.kind}"><img class="bm-ore" src="${src("ore-" + f.kind)}" alt="" width="22" height="22"><span data-no-i18n>${short(f.w)}</span><b>${T(found[f.kind] || "found an ore")}</b><em>${dur(now() - f.t)} ${T("ago")}</em></li>`).join("");
    return `<div class="bm-board"><div><h3>${T("Top builders")}</h3>${rows ? `<ol class="bm-top">${rows}</ol>` : `<p class="bm-note">${T("Settled every hour — the first results appear after the first hour.")}</p>`}</div>
      <div><h3>${T("Rare finds")}</h3>${feed ? `<ul class="bm-feed">${feed}</ul>` : `<p class="bm-note">${T("No gold, diamonds or Arc Crystals yet.")}</p>`}</div></div>`;
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
    const bars = g.layerParts.map((p, i) => `<div class="bm-hbar" style="--h:${(p / 32) * 100}%;--c:${LAYER_COL[i][0]}"><img src="${src("block-" + LAYER_TEX[i])}" alt="" width="30" height="30" loading="lazy"><i></i><span>${T(g.layers[i])}</span><em>${((p / 63) * 100).toFixed(1)}%</em></div>`).join("");
    const odds = (g.ores || []).map((o) => `<li><img src="${src("ore-" + o.kind)}" alt="" width="34" height="34" loading="lazy"><div><b>${T(o.name)}</b><span>1 ${T("in")} ${fmtN(2 ** o.extra)} ${T("shares")}</span></div><em>+${fmtN(o.pts)}</em></li>`).join("");
    const ranks = (g.ranks || []).map((r) => `<li><img src="${src("badge-" + r.id)}" alt="" width="40" height="40" loading="lazy"><div><b>${T(r.name)}</b><span>${fmtN(r.min)}+ ${T("pts")}</span></div><em>${r.pct ? "+" + r.pct + "%" : "—"}</em></li>`).join("");
    return `<div class="bm-how">
      <div><h3>${T("Six layers, each half as rich")}</h3><div class="bm-hbars">${bars}</div><p class="bm-note">${T("A mine runs 3–60 days in six equal layers. The first layer releases half of everything, so the earliest builders dig the richest ground.")}</p></div>
      <div><h3>${T("Rare ores & the jackpot")}</h3><ul class="bm-odds">${odds}</ul><p class="bm-note">${T("Only the best ore in a share counts. The Lucky charm makes every ore twice as likely.")}</p></div>
      <div><h3>${T("Ranks & badges")}</h3><ul class="bm-odds bm-ranks">${ranks}</ul><p class="bm-note">${T("Lifetime points across every mine. Each rank adds a bonus and unlocks characters and pets.")}</p></div>
      <div><h3>${T("Your weight each hour")}</h3>
        <p class="bm-formula"><b>${T("points")}</b> × <b>${T("pickaxe")}</b> × (1 + <b>${T("bonuses")}</b>)</p>
        <ul class="bm-rules">
          <li>${T("Points: every share counts 1, up to")} ${fmtN(g.cap)} ${T("an hour. Rare ores add more (below).")}</li>
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
    saveLook();
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
  // the best ore a share is (same rule as the server's oreOf); the lucky charm makes each one bit easier
  function kindOf(z) {
    const luck = S.me && S.me.weight && S.me.weight.lucky ? 1 : 0, base = (S.work && S.work.bits) || G().shareBits;
    let best = "share";
    for (const o of G().ores || []) if (z >= base + o.extra - luck) best = o.kind;
    return best;
  }
  function onShare(nonce, z) {
    const kind = kindOf(z);
    Scene.share(kind);
    if ((kind === "diamond" || kind === "arc") && typeof window.arcConfetti === "function" && !reduce) window.arcConfetti({ count: kind === "arc" ? 220 : 90 });
    if (kind === "arc") toast("ARC CRYSTAL! The jackpot ore — +500 points.");
    if (S.id === "practice") {
      S.local.shares++; if (kind !== "share") S.local.ores[kind] = (S.local.ores[kind] || 0) + 1;
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
    if (S.me && S.me.hour) { S.me.hour.shares = j.shares; S.me.hour.ores = j.ores || S.me.hour.ores; S.me.cap = j.cap; }
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
      Scene.share(it.tier > 0 ? "diamond" : "gold");
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
    if (mc) { const id = mc.dataset.mine; if (S.mining) stopMining(); S.id = id === "practice" ? "practice" : Number(id); S.local = { shares: 0, ores: {}, dug: S.local.dug }; setHash(); Scene.set({ jump: true }); refresh(); return; }
    const tb = e.target.closest("#bm-tabs [data-tab]");
    if (tb) { S.tab = tb.dataset.tab; paintTabs(); return; }
    const pw = e.target.closest("[data-power]");
    if (pw) { S.power = Number(pw.dataset.power); paintPower(); if (S.mining) { stopMining(); startMining(); } return; }
    const lk = e.target.closest("[data-look]");
    if (lk) { pickLook(lk.dataset.look, lk.dataset.id); return; }
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
