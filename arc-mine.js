/* global ethers, CONFIG, state, connectWallet, ensureArcForWrite, readProvider */
// arc-mine.js — Builder Mine, an ARCIRCLE PAD utility (arcpad.html#mine).
// Holders open a mine with part of a token's supply; builders (Arc's miners) join, mine in the browser and
// claim what they dug. Whatever isn't mined is burned. Every fee is $ARCIRCLE, burned on the spot: opening
// and joining cost 1 USDC worth, items are priced in it.
//   · the rules, the checks and the hourly settle: api/_mine.mjs (routes: api/mine.mjs)
//   · the contract: contracts/contracts/BuilderMine.sol
//   · the hashing: mine-worker.js (Web Workers — only while you press Start and the tab is visible)
//   · the art: images/mine/ (cut from the Builder Mine concept sheets)
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
  const ARCIRCLE = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_TOKEN) || "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
  const BUY_ARC = (typeof CONFIG !== "undefined" && CONFIG.ARCIRCLE_BUY_URL) || "/arc#arcircle";
  const now = () => Math.floor(Date.now() / 1000);
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const fmtN = (n, d = 0) => (n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d }));
  const trim0 = (s) => s.replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
  const compact = (n) => (n == null || !isFinite(n) ? "—" : n >= 1e9 ? trim0((n / 1e9).toFixed(2)) + "B" : n >= 1e6 ? trim0((n / 1e6).toFixed(2)) + "M" : n >= 1e4 ? trim0((n / 1e3).toFixed(1)) + "K" : fmtN(n, n < 10 ? 4 : 2));
  const units = (raw, dec) => { try { return Number(ethers.formatUnits(BigInt(raw || 0), dec == null ? 18 : dec)); } catch (e) { return 0; } };
  const dur = (s) => { s = Math.max(0, Math.floor(s)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${s % 60}s`; };
  const safeLink = (u) => (/^https:\/\/[^\s"<>]+$/i.test(String(u || "")) ? String(u) : "");

  const MINE_ABI = [
    "function join(uint256 id, address referrer)",
    "function buyItem(uint256 itemId, uint256 mineId)",
    "function claim(uint256 id, address account, uint256 cumulative, bytes32[] proof)",
    "function claimMany(uint256[] ids, address account, uint256[] cumulatives, bytes32[][] proofs)",
    "function openMine(address token, uint256 amount, uint64 days_, uint64 startDelay, string name, string about, string link) returns (uint256)",
    "function topUp(uint256 id, uint256 amount)",
    "function setInfo(uint256 id, string name, string about, string link)",
    "function setMinePaused(uint256 id, bool p)",
    "function burnUnmined(uint256 id)",
    "function burnUnclaimed(uint256 id)",
    "function feeArc() view returns (uint256)",
  ];
  const ERC20 = ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)", "function symbol() view returns (string)", "function name() view returns (string)"];

  // ---- the look of each layer: colour, texture, the rock it's made of ----
  const LAYER_COL = [["#6f8f3f", "#5b4630"], ["#8a5a36", "#5e3b22"], ["#7b808a", "#555a64"], ["#4d4652", "#2e2b33"], ["#27304a", "#141a2b"], ["#3b2a2a", "#1c1414"]];
  const LAYER_TEX = ["dirt", "dirt", "stone", "ore", "deep", "bedrock"];
  const LAYER_ROCK = ["block-dirt", "block-dirt", "block-stone", "block-goldore", "block-darkore", "block-bedrock"];
  const LAYER_ICON = ["tile-grass", "tile-dirt", "tile-stone", "tile-ore", "tile-deep", "tile-bedrock"];
  const ORE_COL = { copper: "#ff9a4d", silver: "#e6ecf5", gold: "#ffd35c", diamond: "#7ff6ff", arc: "#c38bff", heart: "#ff6b8b" };
  const ORE_FXART = { gold: "fx-gold", diamond: "fx-blue", arc: "fx-purple", heart: "fx-purple" };
  // October: pumpkins, bats and a dusk sky (or #mine?theme=halloween to preview)
  const HALLOWEEN = new Date().getMonth() === 9 || /[?&]theme=halloween/.test(location.hash);
  const RARE = ["gold", "diamond", "arc", "heart"];
  const TRAIL = [null, null, null, "#e8eef7", "#ffd35c", "#7ff6ff", "#c38bff", "arc"];
  const BOOST_ART = { 1: "prop-lantern", 2: "prop-dynamite", 3: "ore-rainbow", 4: "prop-barrel" };
  const DEFAULT_GAME = {
    epoch: 3600, shareBits: 21, cap: 600, batchEvery: 30, minGap: 25, maxBatch: 120, bonusCap: 100, feeUsd: 1,
    ores: [{ kind: "copper", name: "Copper", extra: 2, pts: 1 }, { kind: "silver", name: "Silver", extra: 4, pts: 2 }, { kind: "gold", name: "Gold", extra: 6, pts: 10 }, { kind: "diamond", name: "Diamond", extra: 10, pts: 60 }, { kind: "arc", name: "Arc Crystal", extra: 14, pts: 500 }],
    layers: ["Grass", "Dirt", "Stone", "Ore", "Deep Rock", "Bedrock"], layerParts: [32, 16, 8, 4, 2, 1],
    pickaxes: [{ tier: 0, id: "wood", name: "Wood pickaxe", mult: 1 }, { tier: 1, id: "stone", name: "Stone pickaxe", mult: 1.15 }, { tier: 2, id: "iron", name: "Iron pickaxe", mult: 1.3 }, { tier: 3, id: "steel", name: "Steel pickaxe", mult: 1.5 }, { tier: 4, id: "gold", name: "Gold pickaxe", mult: 1.7 }, { tier: 5, id: "diamond", name: "Diamond pickaxe", mult: 2 }, { tier: 6, id: "amethyst", name: "Amethyst pickaxe", mult: 2.3 }, { tier: 7, id: "arcane", name: "Arcane pickaxe", mult: 2.7 }],
    ranks: [{ id: "apprentice", name: "Apprentice", min: 0, pct: 0 }, { id: "miner", name: "Miner", min: 1000, pct: 2 }, { id: "foreman", name: "Foreman", min: 10000, pct: 4 }, { id: "architect", name: "Architect", min: 50000, pct: 6 }, { id: "legend", name: "Legend", min: 200000, pct: 10 }],
    characters: [{ id: "apprentice", name: "Apprentice", rank: 0 }, { id: "explorer", name: "Explorer", rank: 0 }, { id: "engineer", name: "Engineer", rank: 1 }, { id: "foreman", name: "Foreman", rank: 2 }, { id: "architect", name: "Architect", rank: 3 }],
    pets: [{ id: "arccat", name: "Arc Cat", rank: 0 }, { id: "corgi", name: "Corgi", rank: 0 }, { id: "slime", name: "Slime", rank: 1 }, { id: "arcia", name: "ARCIA", rank: 1 }, { id: "mole", name: "Mole", rank: 2 }, { id: "picko", name: "Picko", rank: 3 }, { id: "orego", name: "Orego", rank: 4 }],
    quests: [{ id: "dig", name: "Dig 100 shares", goal: 100, xp: 50 }, { id: "rare", name: "Find gold or better", goal: 1, xp: 50 }, { id: "post", name: "Share your mine on X", goal: 1, xp: 50 }], questBonus: 100,
    achievements: [{ id: "first", name: "First swing", about: "Hand in your first share" }, { id: "k1", name: "Thousand swings", about: "1,000 shares, lifetime" }, { id: "k10", name: "Iron arms", about: "10,000 shares, lifetime" }, { id: "gold", name: "Gold rush", about: "Find gold" }, { id: "diamond", name: "Diamond hands", about: "Find a diamond" }, { id: "arc", name: "Arc Crystal", about: "Find the jackpot ore" }, { id: "streak7", name: "Week in the mine", about: "A 7-day streak" }, { id: "posts5", name: "Loud builder", about: "5 proven X posts" }, { id: "crew", name: "Crew member", about: "Join or found a crew" }, { id: "legend", name: "Legend", about: "Reach the Legend rank" }, { id: "heart", name: "Heart hunter", about: "Find the Heart of Arc" }, { id: "book", name: "Collector", about: "Find every ore at least once" }],
    boosts: [{ kind: 1, name: "Lantern", effect: "+15% for 24 h", pct: 15 }, { kind: 2, name: "Dynamite", effect: "+50% for 1 h", pct: 50 }, { kind: 3, name: "Lucky gem", effect: "rare ores twice as often for 24 h", pct: 0 }, { kind: 4, name: "Overtime barrel", effect: "+50% hourly cap for 24 h", pct: 0 }],
    holder: [[100000, 10], [1000000, 20], [5000000, 30]], postPct: 5, postMax: 5, refPct: 5, refMax: 5, referredPct: 5, streakPct: 2, streakMax: 10, streakMin: 30,
    items: [[20000, 1, 0, 0], [60000, 2, 0, 0], [150000, 3, 0, 0], [300000, 4, 0, 0], [700000, 5, 0, 0], [1600000, 6, 0, 0], [4000000, 7, 0, 0], [30000, 0, 1, 86400], [20000, 0, 2, 3600], [40000, 0, 3, 86400], [30000, 0, 4, 86400]],
    rush: { mult: 3, kinds: ["copper", "silver", "gold"] }, heart: { name: "Heart of Arc", extra: 8, pts: 100 }, crewTiers: [[20000, 3], [100000, 5]], minTopUpPct: 1,
  };
  const ACH_ART = { first: "pick-wood", k1: "pick-iron", k10: "pick-steel", gold: "ore-gold", diamond: "ore-diamond", arc: "ore-arc", streak7: "prop-lantern", posts5: "prop-sign", crew: "mm-crew", legend: "badge-legend", heart: "ore-heart", book: "ui-scroll" };

  // ---- the art ----
  const ART = "/images/mine/";
  const IMG = {};
  const img = (k) => { if (!IMG[k]) { const i = new Image(); i.decoding = "async"; i.src = ART + k + ".webp"; IMG[k] = i; } return IMG[k]; };
  const ok = (i) => i && i.complete && i.naturalWidth > 0;
  const src = (k) => ART + k + ".webp";
  // only what the first frames need; the rest (other characters, pets, effects) loads the first time it's drawn
  function preload(look) {
    const l = look || { char: "apprentice", pet: "arccat" };
    ["char-" + l.char, "pet-" + l.pet, ...(l.char === "apprentice" ? ["anim-idle", "anim-mine", "anim-hit"] : []),
      "ore-copper", "ore-silver", "ore-gold", "ore-diamond", "ore-arc",
      ...LAYER_ROCK, "block-grass", "block-magma", ...LAYER_TEX.map((t) => "tex-" + t),
      "prop-cartgems", "prop-rails", "prop-barrel", "prop-crate", "prop-lantern", "prop-sign"].forEach(img);
    // the rest when the browser is idle
    const later = () => ["fx-gold", "fx-blue", "fx-purple", "fx-slash", "ore-heart", "anim-skill", "anim-celebrate", "prop-chestopen", "prop-dynamite", "prop-chest", ...LAYER_ICON].forEach(img);
    if ("requestIdleCallback" in window) requestIdleCallback(later, { timeout: 4000 }); else setTimeout(later, 2500);
  }

  // ---- state ----
  const S = {
    booted: false, cfg: null, G: DEFAULT_GAME, list: [], id: null, view: null, me: null, bd: null, boards: null, tab: "mine", boardTab: "season",
    live: false, address: "", practice: false,
    sess: null, mining: false, workers: [], rates: {}, queue: [], work: null, power: Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1)),
    local: { shares: 0, ores: {}, dug: 0 }, subTimer: 0, pollTimer: 0, clock: 0, busy: false, capHit: false,
    lastShareAt: 0, tutorial: 0, sound: lsGet("bm.sound") === "1", lastMined: null, lastLayer: -1, safety: {},
    logo: {}, stats: null, worldView: lsGet("bm.wview") || "cards", filter: "all", sort: "new", feedSeen: null, claims: null, cardPick: null, shareFind: null, installEvt: null, hudOpen: false,
  };
  const G = () => S.G;
  try { S.look = JSON.parse(lsGet("bm.look") || "null"); } catch (e) { S.look = null; }
  const mineAddr = () => S.address || ((typeof CONFIG !== "undefined" && isAddr(CONFIG.BUILDER_MINE_ADDRESS)) ? CONFIG.BUILDER_MINE_ADDRESS : "");
  const api = async (q, opt) => { const r = await fetch(`/api/mine?${q}`, { cache: "no-store", ...(opt || {}) }); const j = await r.json().catch(() => ({})); if (!r.ok && !j.error) j.error = `HTTP ${r.status}`; j._status = r.status; return j; };
  const post = (q, body) => api(q, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const me0 = () => String(state.account || "").toLowerCase();

  // ---- sound (off by default) and a buzz on phones ----
  const Sound = (() => {
    let ac = null;
    const ctx = () => { if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); } if (ac && ac.state === "suspended") ac.resume(); return ac; };
    function tone(f, t0, d, type = "sine", g = 0.06) { const a = ctx(); if (!a) return; const o = a.createOscillator(), v = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, a.currentTime + t0); v.gain.setValueAtTime(g, a.currentTime + t0); v.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + d); o.connect(v).connect(a.destination); o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + d + 0.02); }
    function noise(d, g = 0.05) { const a = ctx(); if (!a) return; const b = a.createBuffer(1, Math.floor(a.sampleRate * d), a.sampleRate), ch = b.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length); const s = a.createBufferSource(), v = a.createGain(), f = a.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1800; v.gain.value = g; s.buffer = b; s.connect(f).connect(v).connect(a.destination); s.start(); }
    return {
      clink() { if (!S.sound) return; noise(0.06, 0.05); tone(2200 + Math.random() * 300, 0, 0.09, "triangle", 0.035); },
      ore(kind) { if (!S.sound) return; const base = { copper: 660, silver: 784, gold: 880, diamond: 1046, arc: 1318 }[kind] || 660; [0, 0.07, 0.14].forEach((t, i) => tone(base * [1, 1.25, 1.5][i], t, 0.25, "sine", 0.05)); },
      jackpot() { if (!S.sound) return; [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.09, 0.6, "triangle", 0.05)); },
      level() { if (!S.sound) return; [392, 523, 659].forEach((f, i) => tone(f, i * 0.12, 0.4, "sine", 0.05)); },
    };
  })();
  const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* not a phone */ } };

  // =====================================================================================
  // the scene: the mine in cross-section — sky, rock walls, the gallery, the builder, the pet
  // =====================================================================================
  const Scene = (() => {
    let cv = null, cx = null, W = 0, H = 0, dpr = 1, raf = 0, last = 0, on = false;
    const LH = 380, SURF = 230;                      // a layer's height, the sky above the surface (world px)
    let depth = 0.06, targetDepth = 0.06, t = 0, swingT = 1, hitAt = -9, shake = 0, flash = 0, flashCol = "#fff", crack = 0, jackpot = 0;
    let pet = { jump: 0, kind: "" }, card = null, payday = 0, paydayText = "", descend = 0;
    let parts = [], floats = [], pops = [], motes = [], idle = true, label = "", layerNames = DEFAULT_GAME.layers;
    let look = { char: "apprentice", pet: "arccat" }, tier = 0, boosts = [0, 0, 0, 0], cart = {}, others = [], nextBoom = 0;
    let walls = [], wallW = 0, orePins = [];
    // v3: slow motion on a diamond, light pillars, effect sprites, item drops, the combo, the cart leaving at the hour,
    // the apprentice's real animation frames, a light mode for slow phones
    let slow = 0, pillar = 0, pillarCol = "#c38bff", fxs = [], drops = [], combo = 0, comboAt = -99, comboPulse = 0;
    let cartX0 = null, cartOff = 0, cartMode = "in", hourLeft = 9999, celebrate = 0, skillT = 0, lookBack = 0, nextLook = 6;
    let lowFx = false, ft = [], lastFlashAt = -9, rush = "", bigText = null;
    const bats = HALLOWEEN ? Array.from({ length: 4 }, (_, i) => ({ x: Math.random(), y: 0.2 + Math.random() * 0.5, s: 0.6 + Math.random() * 0.6, v: 0.03 + Math.random() * 0.04, p: i })) : [];
    const rnd = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
    // each layer's rock wall is drawn once into its own canvas (rebuilt on resize)
    function buildWalls() {
      walls = []; orePins = []; wallW = W;
      for (let l = 0; l < 6; l++) {
        const c = document.createElement("canvas"); c.width = Math.ceil(W); c.height = LH;
        const g = c.getContext("2d");
        const gr = g.createLinearGradient(0, 0, 0, LH); gr.addColorStop(0, LAYER_COL[l][0]); gr.addColorStop(1, LAYER_COL[l][1]);
        g.fillStyle = gr; g.fillRect(0, 0, c.width, LH);
        const tex = img("tex-" + LAYER_TEX[l]);
        if (ok(tex)) { g.globalAlpha = 0.28; const p = g.createPattern(tex, "repeat"); g.fillStyle = p; g.fillRect(0, 0, c.width, LH); g.globalAlpha = 1; }
        const rock = img(LAYER_ROCK[l]), R = rnd(97 + l * 13);
        if (ok(rock)) {
          const n = Math.floor((c.width * LH) / 2300);
          for (let i = 0; i < n; i++) {
            const s = 30 + R() * 30, x = R() * c.width, y = 10 + R() * (LH - 20);
            g.save(); g.translate(x, y); g.rotate((R() - 0.5) * 0.9); g.globalAlpha = 0.35 + R() * 0.45;
            g.drawImage(rock, -s / 2, -s / 2, s, (s * rock.naturalHeight) / rock.naturalWidth); g.restore();
          }
          // a darker wash so the builder reads in front
          const sh = g.createLinearGradient(0, 0, 0, LH); sh.addColorStop(0, "rgba(0,0,0,.05)"); sh.addColorStop(1, "rgba(0,0,0,.35)"); g.fillStyle = sh; g.fillRect(0, 0, c.width, LH);
        }
        if (l === 5) { const mg = img("block-magma"); if (ok(mg)) for (let i = 0; i < 8; i++) { const s = 40 + R() * 30; g.globalAlpha = 0.9; g.drawImage(mg, R() * c.width, LH - 60 - R() * 60, s, s * 0.85); } g.globalAlpha = 1; }
        const kinds = ["copper", "copper", "silver", "gold", "diamond", "arc"];
        for (let i = 0; i < 7; i++) { const ore = kinds[Math.min(5, Math.floor(R() * (2 + l * 0.9)))]; orePins.push({ l, x: R() * c.width, y: 30 + R() * (LH - 60), s: 18 + R() * 12 + l * 2, ore, a: R() * 6.28 }); }
        walls.push(c);
      }
    }
    function size() {
      if (!cv) return;
      const r = cv.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = Math.max(280, r.width); H = Math.max(240, r.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.imageSmoothingQuality = "high";
      walls = [];
    }
    function mount(c) { cv = c; cx = c.getContext("2d"); preload(); size(); for (let i = 0; i < 30; i++) motes.push({ x: Math.random(), y: Math.random(), v: 0.004 + Math.random() * 0.01, s: 0.6 + Math.random() * 1.6 }); }
    const worldY = () => SURF + depth * LH * 6;
    function start() { if (on || !cv) return; on = true; last = performance.now(); raf = requestAnimationFrame(loop); }
    function stop() { on = false; cancelAnimationFrame(raf); }
    function loop(ts) {
      if (!on) return;
      const real = Math.min(0.05, (ts - last) / 1000); last = ts;
      // a phone that can't keep up (under ~30 fps for three seconds) gets the light mode: fewer particles, no glows
      if (!lowFx) { ft.push(real); if (ft.length > 90) { const avg = ft.reduce((a, b) => a + b, 0) / ft.length; ft = []; if (avg > 0.034) { lowFx = true; if (Scene.onLow) Scene.onLow(); } } }
      slow = Math.max(0, slow - real);
      const dt = slow > 0 ? real * 0.3 : real; t += dt;
      step(dt, real); draw();
      raf = requestAnimationFrame(loop);
    }
    // the builder's spot, size and the rock face in front (screen px)
    const geo = () => { const mob = W < 560, ch = Math.min(H * 0.44, mob ? 170 : 240), bx = W * (mob ? 0.5 : 0.56), fy = H * (mob ? 0.62 : 0.72); return { mob, ch, bx, fy, fx: bx + ch * 0.44, gh: ch * 1.16 }; };
    function face() { const g = geo(); return { x: g.fx + 6, y: g.fy - g.ch * 0.45 }; }
    function layerIdx() { return Math.min(5, Math.floor(depth * 6)); }
    function step(dt, real) {
      const k = descend > 0 ? 0.6 : 1.5;
      pillar = Math.max(0, pillar - (real || dt) * 0.8); celebrate = Math.max(0, celebrate - dt); skillT = Math.max(0, skillT - dt); comboPulse = Math.max(0, comboPulse - dt * 3);
      if (idle && t - comboAt > 4) combo = 0;
      for (const f of fxs) f.t += dt;
      fxs = fxs.filter((f) => f.t < f.dur);
      for (const d of drops) { if (!d.landed) { d.vy += 1400 * dt; d.y += d.vy * dt; if (d.y >= 0) { d.y = 0; if (Math.abs(d.vy) < 120) { d.landed = true; } else { d.vy *= -0.35; if (!d.bounced) { d.bounced = true; chips(8, 0.6, "#ffe3ad"); } } } } d.life -= dt; }
      drops = drops.filter((d) => d.life > 0);
      // idle: now and then the builder glances back at the tunnel
      if (idle) { if (t > nextLook) { lookBack = 0.9; nextLook = t + 6 + Math.random() * 6; } lookBack = Math.max(0, lookBack - dt); } else lookBack = 0;
      // the cart: leaves with this hour's ores in the last seconds, a new one rolls in with the hour
      if (cartMode === "out") cartOff = Math.min(cartOff + dt * 180, 900);
      else if (cartMode === "in") { cartOff = Math.max(0, cartOff - dt * 220); }
      if (bigText) { bigText.t += dt; if (bigText.t > bigText.dur) bigText = null; }
      for (const b of bats) { b.x += b.v * dt; if (b.x > 1.1) { b.x = -0.1; b.y = 0.15 + Math.random() * 0.5; } }
      depth += (targetDepth - depth) * Math.min(1, dt * k);
      descend = Math.max(0, descend - dt);
      if (!idle) { const was = swingT; swingT += dt * 1.15; if (swingT >= 1) swingT = 0; if (swingT > 0.55 && was <= 0.55) { chips(4, 0.7); crack = Math.min(1, crack + 0.03); Sound.clink(); } }
      shake = Math.max(0, shake - dt * 2.4); flash = Math.max(0, flash - dt * 2); jackpot = Math.max(0, jackpot - dt * 0.45); payday = Math.max(0, payday - dt * 0.5);
      pet.jump = Math.max(0, pet.jump - dt * 1.6);
      const fl = geo().fy;
      for (const p of parts) {
        p.vy += (p.g == null ? 900 : p.g) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.rot += p.vr * dt;
        if (!p.star && p.y > fl - 3 && p.vy > 0) { p.y = fl - 3; p.vy *= -0.35; p.vx *= 0.6; p.vr *= 0.5; } // debris bounces on the floor
      }
      parts = parts.filter((p) => p.life > 0);
      for (const f of floats) { f.y -= 40 * dt; f.life -= dt; }
      floats = floats.filter((f) => f.life > 0);
      for (const o of pops) o.t += dt;
      const done = pops.filter((o) => o.t >= o.dur);
      pops = pops.filter((o) => o.t < o.dur);
      for (const o of done) if (Scene.onCollect) Scene.onCollect(o.kind, o.sx, o.sy);
      for (const m of motes) { m.y -= m.v * dt; if (m.y < 0) { m.y = 1; m.x = Math.random(); } }
      if (card) { card.t += dt; if (card.t > 2.8) card = null; }
      // dynamite: a harmless blast every ~20 s while it's lit
      if (boosts[1] > now() && !idle && t > nextBoom) { nextBoom = t + 18 + Math.random() * 6; chips(22, 1.4, "#ffb070"); sparkle(30, "#ffcf6e"); shake = reduce ? 0 : 0.6; flash = 0.35; flashCol = "#ffb070"; }
    }
    function chips(n, force = 1, col) {
      if (reduce) n = Math.min(n, 3);
      if (lowFx) n = Math.ceil(n / 2);
      const f = face(), L = LAYER_COL[layerIdx()];
      for (let i = 0; i < n; i++) parts.push({ x: f.x, y: f.y + (Math.random() - 0.5) * 40, vx: -40 - Math.random() * 240 * force, vy: -140 - Math.random() * 280 * force, life: 1 + Math.random() * 0.8, s: 3 + Math.random() * 5 * force, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, col: col || L[Math.random() < 0.5 ? 0 : 1] });
    }
    function sparkle(n, col) {
      const f = face();
      for (let i = 0; i < (reduce ? Math.min(n, 8) : lowFx ? Math.ceil(n / 3) : n); i++) { const a = Math.random() * 6.28, v = 80 + Math.random() * 300; parts.push({ x: f.x - 10, y: f.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 140, life: 0.8 + Math.random() * 0.9, s: 2 + Math.random() * 3.5, rot: 0, vr: 0, col, star: true, g: 360 }); }
    }
    function float(text, col, big) { const f = face(), k = floats.filter((x) => x.big).length; floats.push({ x: f.x - 60 + (Math.random() - 0.5) * 40, y: f.y - 70 - (big ? k * 28 : 0), text, col, life: big ? 2.2 : 1.1, big }); }
    // how loud each ore is: [sparkles, shake, flash]; the rarer, the bigger — flashes are capped for comfort
    const ORE_FX = { copper: [6, 0.15, 0], silver: [12, 0.25, 0], gold: [26, 0.5, 0.14], diamond: [50, 0.9, 0.2], arc: [100, 1.2, 0.25], heart: [80, 1, 0.22] };
    function doFlash(a, col) {
      if (reduce || a <= 0 || t - lastFlashAt < 0.4) return; // never more than a flash every 0.4 s
      lastFlashAt = t; flash = Math.min(0.25, a); flashCol = col;
    }
    function share(kind) {
      swingT = 0.5; hitAt = t; crack = Math.min(1, crack + 0.1);
      combo = t - comboAt < 75 ? combo + 1 : 1; comboAt = t; if (combo >= 3) comboPulse = 1;
      const o = kind === "heart" ? { name: G().heart ? G().heart.name : "Heart of Arc", pts: G().heart ? G().heart.pts : 100 } : (G().ores || []).find((x) => x.kind === kind);
      if (o) {
        const [n, sh, fl] = ORE_FX[kind] || [8, 0.3, 0.2];
        const boost = Math.min(1.6, 1 + combo / 40);
        chips((8 + n / 4) * boost, 1.1); sparkle(n, ORE_COL[kind]);
        const f = face();
        pops.push({ kind, t: 0, dur: kind === "arc" || kind === "heart" ? 2.4 : 1.25, x0: f.x - 8, y0: f.y, sx: 0, sy: 0 });
        const isRush = kind === rush && G().rush;
        const pts = isRush ? o.pts * G().rush.mult : o.pts;
        float(`${tr(o.name).toUpperCase()} +${pts}${isRush ? " " + tr("RUSH") : ""}`, ORE_COL[kind], kind !== "copper");
        shake = reduce ? 0 : sh; doFlash(fl, ORE_COL[kind]);
        pet.jump = kind === "copper" ? 0.5 : 1; pet.kind = kind;
        if (ORE_FXART[kind] && !lowFx) fxs.push({ k: ORE_FXART[kind], t: 0, dur: kind === "gold" ? 0.8 : 1.2, x: f.x - 20, y: f.y + 30, h: kind === "gold" ? 110 : 150 });
        if (RARE.includes(kind)) celebrate = 1.4;
        if (kind === "diamond" && !reduce) slow = 0.3;
        if (kind === "arc" || kind === "heart") { if (!reduce) pillar = 1; pillarCol = ORE_COL[kind]; if (kind === "arc") jackpot = 1; else bigText = { text: tr("HEART OF ARC"), sub: `+${pts}`, col: ORE_COL.heart, t: 0, dur: 2.6 }; }
        if (kind !== "copper" && kind !== "silver") crack = 0;
        Sound.ore(kind === "heart" ? "arc" : kind); if (kind === "arc" || kind === "heart") Sound.jackpot();
        buzz(kind === "arc" || kind === "heart" ? [80, 40, 160] : kind === "diamond" ? 60 : kind === "gold" ? 30 : 0);
      } else { chips(7 * Math.min(1.6, 1 + combo / 40), 0.9); float("+1", "#eaf2e6"); if (crack >= 1) { crack = 0; chips(16, 1.2); } }
    }
    // a bought item drops from the top of the mine and lands by the builder
    function drop(k) { const g = geo(); drops.push({ k, x: g.bx - g.ch * (0.2 + Math.random() * 0.3), y: -H, vy: 0, life: 4, landed: false }); }
    // ---- drawing ----
    function roundRect(x, y, w, h, r) { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); }
    function drawImg(k, x, y, h, opt = {}) {
      const im = img(k);
      if (!ok(im)) return false;
      const w = (h * im.naturalWidth) / im.naturalHeight;
      cx.save(); cx.translate(x, y);
      if (opt.rot) cx.rotate(opt.rot);
      if (opt.flip) cx.scale(-1, 1);
      if (opt.sx || opt.sy) cx.scale(opt.sx || 1, opt.sy || 1);
      if (opt.alpha != null) cx.globalAlpha = opt.alpha;
      if (opt.glow && !lowFx) { cx.shadowColor = opt.glow; cx.shadowBlur = opt.blur || 18; }
      cx.drawImage(im, -w * (opt.ax == null ? 0.5 : opt.ax), -h * (opt.ay == null ? 1 : opt.ay), w, h);
      cx.restore();
      return true;
    }
    // the sky follows the viewer's clock: night, dawn, day, dusk
    function sky() {
      const h = new Date().getHours() + new Date().getMinutes() / 60;
      if (HALLOWEEN && (h < 6 || h >= 17)) return ["#12081f", "#3b1648", "#c2551f", 0.8];
      if (h < 5 || h >= 20.5) return ["#070b24", "#1f1846", "#3a2a5c", 1];
      if (h < 7.5) return ["#26305e", "#b96a7a", "#f2a86a", 0.3];
      if (h < 17.5) return ["#3e7ad1", "#7cb4ea", "#bfe0f5", 0];
      return ["#2b2e66", "#c2607a", "#f0a15c", 0.3];
    }
    function draw() {
      if (!cx) return;
      if (walls.length !== 6 || wallW !== W) { if (ok(img(LAYER_ROCK[2]))) buildWalls(); }
      const sx = shake ? (Math.random() - 0.5) * 16 * shake : 0, sy = shake ? (Math.random() - 0.5) * 12 * shake : 0;
      // the gallery always sits below the grass: near the top of a mine the camera stops at the surface
      const gg = geo(), camY = Math.max(worldY(), SURF + gg.gh + 26) - gg.fy;
      cx.save(); cx.clearRect(0, 0, W, H); cx.translate(sx, sy);
      const skyB = SURF - camY;
      if (skyB > 0) {
        const [c0, c1, c2, stars] = sky();
        const g = cx.createLinearGradient(0, skyB - SURF, 0, skyB); g.addColorStop(0, c0); g.addColorStop(0.65, c1); g.addColorStop(1, c2);
        cx.fillStyle = g; cx.fillRect(0, 0, W, skyB);
        if (stars) { cx.fillStyle = "#fff"; for (let i = 0; i < 34; i++) { const x = (i * 97.3) % W, y = ((i * 53.1) % Math.max(1, skyB - 50)); cx.globalAlpha = stars * (0.25 + 0.35 * Math.sin(t * 1.3 + i)); cx.fillRect(x, y, 1.8, 1.8); } cx.globalAlpha = 1; }
        for (let i = 0; i < 7; i++) { const x = ((i * 211) % W), hg = 20 + (i * 7) % 22; cx.fillStyle = i % 2 ? "rgba(150,110,255,.6)" : "rgba(80,170,255,.55)"; cx.beginPath(); cx.moveTo(x, skyB); cx.lineTo(x + 7, skyB - hg); cx.lineTo(x + 14, skyB); cx.fill(); }
        const hx = W * (gg.mob ? 0.2 : 0.28);
        cx.strokeStyle = "#8a6a45"; cx.lineWidth = 5;
        cx.beginPath(); cx.moveTo(hx - 40, skyB); cx.lineTo(hx, skyB - 104); cx.lineTo(hx + 40, skyB); cx.moveTo(hx - 27, skyB - 36); cx.lineTo(hx + 27, skyB - 36); cx.moveTo(hx - 14, skyB - 70); cx.lineTo(hx + 14, skyB - 70); cx.stroke();
        cx.fillStyle = "#ffc861"; cx.beginPath(); cx.arc(hx, skyB - 104, 11, 0, 6.28); cx.fill();
        drawImg("prop-sign", hx + (gg.mob ? 70 : 96), skyB + 4, gg.mob ? 56 : 72);
        if (label) { cx.save(); cx.font = `900 ${gg.mob ? 12 : 14}px Sora, Inter, sans-serif`; cx.textAlign = "center"; cx.fillStyle = "#fff"; cx.shadowColor = "rgba(0,0,0,.8)"; cx.shadowBlur = 6; cx.fillText(label, hx + (gg.mob ? 70 : 96), skyB - (gg.mob ? 62 : 80)); cx.restore(); }
        drawImg("prop-lantern", W * 0.66, skyB + 2, 40, { glow: "#ffb45c", blur: 14 + 4 * Math.sin(t * 5) });
        drawImg("prop-crate", W * 0.78, skyB + 2, 44);
        drawImg("prop-barrel", W * 0.86, skyB + 2, 48);
        if (HALLOWEEN) {
          pumpkin(W * 0.72, skyB, 16); pumpkin(W * 0.93, skyB, 12); pumpkin(hx - 52, skyB, 13);
          for (const b of bats) bat(b.x * W, skyB - SURF + b.y * SURF, b.s, t * 14 + b.p);
        }
      }
      // the rock walls (drawn once per layer) and the ores glinting in them
      for (let l = 0; l < 6; l++) {
        const top = SURF + l * LH - camY;
        if (top + LH < 0 || top > H) continue;
        if (walls[l]) cx.drawImage(walls[l], 0, top, W, LH);
        else { cx.fillStyle = LAYER_COL[l][1]; cx.fillRect(0, top, W, LH); }
        if (l === 0) { const gb = img("block-grass"); cx.fillStyle = "#86c94f"; cx.fillRect(0, top, W, 12); cx.fillStyle = "#5d9a36"; for (let x = 0; x < W; x += 8) cx.fillRect(x, top + 10, 5, 4 + ((x * 7) % 6)); if (ok(gb)) for (let x = 10; x < W; x += 170) drawImg("block-grass", x, top + 40, 34, { alpha: 0.9 }); }
        cx.fillStyle = "rgba(0,0,0,.4)"; cx.fillRect(0, top, W, 4);
        // the ores glinting in the wall sit a little deeper than the rock (they drift slower as you descend)
        const par = (camY - (SURF + l * LH - H / 2)) * 0.1;
        for (const p of orePins) if (p.l === l) { const gl = 0.5 + 0.5 * Math.sin(t * 2.2 + p.a * 3); drawImg("ore-" + p.ore, p.x, top + p.y + par, p.s * 1.3, { ay: 0.5, rot: p.a * 0.3 - 0.4, glow: ORE_COL[p.ore], blur: 6 + gl * 12, alpha: 0.7 + 0.25 * gl }); }
        cx.save(); cx.font = "800 12px Sora, Inter, sans-serif"; cx.textAlign = "left"; cx.shadowColor = "rgba(0,0,0,.8)"; cx.shadowBlur = 5;
        drawImg(LAYER_ICON[l], 28, top + 50, 32, { ay: 0.5 });
        cx.fillStyle = "#fff"; cx.fillText(`${l + 1} · ${tr(layerNames[l] || "")}`, 50, top + 44);
        cx.fillStyle = "rgba(255,255,255,.75)"; cx.font = "700 11px Inter, sans-serif"; cx.fillText(`${G().layerParts[l]}/63 ${tr("of the mine")}`, 50, top + 60);
        cx.restore();
      }
      // the shaft, the gallery, rails and timber
      const fy = gg.fy, sxh = W * (gg.mob ? 0.2 : 0.28), top0 = Math.max(0, SURF - camY), gtop = fy - gg.gh;
      cx.fillStyle = "rgba(10,10,16,.9)";
      cx.fillRect(sxh - 26, top0, 52, fy - top0 + 4);
      roundRect(sxh - 26, gtop, gg.fx - sxh + 30, gg.gh + 6, 24); cx.fill();
      const inner = cx.createLinearGradient(0, gtop, 0, fy); inner.addColorStop(0, "rgba(70,50,110,.35)"); inner.addColorStop(1, "rgba(0,0,0,0)"); cx.fillStyle = inner; roundRect(sxh - 26, gtop, gg.fx - sxh + 30, gg.gh + 6, 24); cx.fill();
      cx.strokeStyle = "rgba(170,120,70,.8)"; cx.lineWidth = 3;
      for (let y = top0 + ((camY % 22) + 22) % 22; y < gtop + 6; y += 22) { cx.beginPath(); cx.moveTo(sxh - 14, y); cx.lineTo(sxh + 14, y); cx.stroke(); }
      cx.beginPath(); cx.moveTo(sxh - 14, top0); cx.lineTo(sxh - 14, gtop + 8); cx.moveTo(sxh + 14, top0); cx.lineTo(sxh + 14, gtop + 8); cx.stroke();
      cx.strokeStyle = "rgba(170,180,195,.6)"; cx.lineWidth = 2.5; cx.beginPath(); cx.moveTo(sxh + 24, fy - 2); cx.lineTo(gg.fx - 4, fy - 2); cx.stroke();
      cx.fillStyle = "#6b4a2b"; for (let x = sxh + 54; x < gg.bx - gg.ch * 0.6; x += 74) { cx.fillRect(x, gtop, 8, gg.gh + 6); cx.fillRect(x - 7, gtop - 4, 22, 8); }
      for (let x = sxh + 64; x < gg.fx - 30; x += 150) drawImg("prop-lantern", x, gtop + 34, 26, { glow: "#ffb45c", blur: 12 + 3 * Math.sin(t * 4 + x) });
      // other builders digging now (from the server), small and further back
      others.slice(0, gg.mob ? 1 : 3).forEach((o, i) => {
        const ox = sxh + 40 + i * 58, ph = (t * 1.1 + i * 0.37) % 1, rot = ph < 0.5 ? -0.1 * ph * 2 : 0.18 * (1 - (ph - 0.5) * 2);
        if (ox < gg.bx - gg.ch * 0.7) drawImg("char-" + o, ox, fy - 2, gg.ch * 0.42, { alpha: 0.55, rot });
      });
      // the cart: this hour's ores pile up in it
      const cw = Math.min(110, gg.ch * 0.5), cartHome = gg.bx - gg.ch * 1.15;
      for (let x = sxh + 20; x < gg.fx - 10; x += cw * 1.2) drawImg("prop-rails", x, fy + 6, cw * 0.32, { ax: 0, alpha: 0.85 });
      // the cart leaves with this hour's ores in the last 10 seconds of the hour, and an empty one rolls in
      if (hourLeft <= 10 && cartMode !== "out" && Object.values(cart).some((n) => n > 0)) { cartMode = "out"; if (Scene.onCartOut) Scene.onCartOut(); }
      const cartX = cartHome - cartOff;
      if (cartHome > sxh + 30 && cartX > sxh - cw) {
        const pile = []; for (const o of ["arc", "diamond", "gold", "silver", "copper"]) for (let i = 0; i < Math.min(6, cart[o] || 0); i++) pile.push(o);
        const bump = cartOff > 0 && cartOff < 900 ? Math.sin(t * 30) * 1.2 : 0;
        pile.slice(0, 10).forEach((o, i) => drawImg("ore-" + o, cartX - cw * 0.3 + (i % 5) * (cw * 0.14), fy - cw * 0.62 - Math.floor(i / 5) * 12 + bump, cw * 0.26, { ay: 0.7, glow: o === "arc" || o === "diamond" ? ORE_COL[o] : null, blur: 10 }));
        drawImg("prop-cart", cartX, fy + 2 + bump, cw * 0.72);
        if (cartMode === "out" && !reduce && Math.random() < 0.4) parts.push({ x: cartX + cw * 0.3, y: fy - 2, vx: 60 + Math.random() * 60, vy: -40 - Math.random() * 40, life: 0.35, s: 2, rot: 0, vr: 0, col: "#ffd35c", star: true, g: 300 });
      }
      // the rock face, cracking as it's hit
      const f = face(), L = layerIdx();
      cx.save(); roundRect(gg.fx - 2, gtop - 4, 60, gg.gh + 10, 12); cx.clip();
      if (walls[L]) cx.drawImage(walls[L], gg.fx - 2, 0, 60, LH, gg.fx - 2, gtop - 4, 60, gg.gh + 10); else { cx.fillStyle = LAYER_COL[L][1]; cx.fillRect(gg.fx - 2, gtop - 4, 60, gg.gh + 10); }
      cx.restore();
      cx.strokeStyle = `rgba(0,0,0,${0.35 + crack * 0.45})`; cx.lineWidth = 2.5; cx.beginPath();
      const n = 1 + Math.floor(crack * 6); for (let i = 0; i < n; i++) { const yy = gtop + 10 + i * (gg.gh / 7); cx.moveTo(f.x, yy); cx.lineTo(f.x + 14, yy + 8); cx.lineTo(f.x + 6, yy + 15); } cx.stroke();
      if (t - hitAt < 0.25) { const k = 1 - (t - hitAt) / 0.25; cx.strokeStyle = `rgba(255,240,200,${k})`; cx.lineWidth = 3; cx.beginPath(); cx.arc(f.x, f.y, 10 + 30 * (1 - k), 0, 6.28); cx.stroke(); }
      // headlamp (the lantern boost makes it wider and warmer)
      const lit = boosts[0] > now(), lx = gg.bx + gg.ch * 0.12, ly = fy - gg.ch * 0.86;
      const lg = cx.createRadialGradient(lx, ly, 4, lx + 40, ly + 20, gg.ch * (lit ? 1.6 : 1.1));
      lg.addColorStop(0, `rgba(255,${lit ? 220 : 236},${lit ? 140 : 170},${(lit ? 0.5 : 0.34) + 0.05 * Math.sin(t * 9)})`); lg.addColorStop(1, "rgba(255,236,170,0)");
      cx.fillStyle = lg; cx.beginPath(); cx.moveTo(lx, ly); cx.lineTo(lx + gg.ch * (lit ? 1.6 : 1.2), ly - gg.ch * (lit ? 0.6 : 0.3)); cx.lineTo(lx + gg.ch * (lit ? 1.6 : 1.2), ly + gg.ch * (lit ? 1 : 0.8)); cx.closePath(); cx.fill();
      // boosts you can see
      if (lit) drawImg("prop-lantern", gg.bx - gg.ch * 0.34, fy - 4, gg.ch * 0.22, { glow: "#ffb45c", blur: 22 });
      if (boosts[1] > now()) { drawImg("prop-dynamite", gg.fx - 16, fy - 2, gg.ch * 0.16); if (Math.random() < 0.5) parts.push({ x: gg.fx - 12, y: fy - gg.ch * 0.16, vx: (Math.random() - 0.5) * 40, vy: -60 - Math.random() * 60, life: 0.4, s: 2, rot: 0, vr: 0, col: "#ffcf6e", star: true, g: 0 }); }
      if (boosts[3] > now()) { drawImg("prop-barrel", gg.bx + gg.ch * 0.02, fy + 1, gg.ch * 0.2, { ax: 1.6 }); for (let i = 0; i < 3; i++) { cx.fillStyle = `rgba(255,255,255,${0.12 + 0.08 * Math.sin(t * 2 + i)})`; cx.beginPath(); cx.arc(gg.bx - gg.ch * 0.25 + Math.sin(t * 1.5 + i) * 5, fy - gg.ch * 0.26 - ((t * 20 + i * 12) % 36), 4 + i, 0, 6.28); cx.fill(); } }
      for (const d of drops) drawImg(d.k, d.x, fy + d.y, gg.ch * 0.26, { alpha: Math.min(1, d.life), glow: "#ffe3ad", blur: 16 });
      drawPet(gg); drawBuilder(gg);
      // light pillar for the Arc Crystal and the Heart of Arc
      if (pillar > 0) {
        const f0 = face(), pw = 70 + 40 * Math.sin(t * 6), a = Math.min(1, pillar * 1.4);
        const pg = cx.createLinearGradient(f0.x - pw, 0, f0.x + pw, 0); pg.addColorStop(0, "rgba(0,0,0,0)"); pg.addColorStop(0.5, pillarCol); pg.addColorStop(1, "rgba(0,0,0,0)");
        cx.save(); cx.globalAlpha = 0.55 * a; cx.globalCompositeOperation = "lighter"; cx.fillStyle = pg; cx.fillRect(f0.x - pw, 0, pw * 2, fy); cx.restore();
      }
      for (const fx0 of fxs) { const k = fx0.t / fx0.dur, sc = 0.6 + 0.6 * Math.min(1, k * 3); drawImg(fx0.k, fx0.x, fx0.y, fx0.h * sc, { alpha: 1 - Math.pow(k, 2), ay: 1 }); }
      if (combo >= 3) {
        cx.save(); const cs = 1 + comboPulse * 0.25; cx.translate(W / 2, gg.mob ? 64 : 70); cx.scale(cs, cs);
        cx.font = "900 16px Sora, Inter, sans-serif"; cx.textAlign = "center"; cx.lineWidth = 4; cx.strokeStyle = "rgba(0,0,0,.7)";
        const ct = `${tr("COMBO")} ×${combo}`; cx.strokeText(ct, 0, 0); cx.fillStyle = combo >= 20 ? "#c38bff" : combo >= 10 ? "#7ff6ff" : "#ffd35c"; cx.fillText(ct, 0, 0); cx.restore();
      }
      // ores flying out of the rock (then into the HUD — the page animates that part)
      for (const o of pops) {
        const k = o.t / o.dur, e = 1 - Math.pow(1 - Math.min(1, k * 1.6), 3);
        const x = o.x0 - 60 * e, y = o.y0 - (gg.ch * 0.9) * e;
        o.sx = x + sx; o.sy = y + sy;
        const sz = (o.kind === "arc" ? 96 : o.kind === "diamond" ? 76 : 58) * (0.6 + 0.4 * Math.sin(Math.min(1, k * 3) * 1.57));
        drawImg("ore-" + o.kind, x, y, o.kind === "heart" ? sz * 1.25 : sz, { ay: 0.5, glow: ORE_COL[o.kind], blur: 26, rot: Math.sin(t * 6) * 0.1 });
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
      // dust in the air (not in light mode)
      if (!lowFx) cx.fillStyle = "rgba(255,240,210,.35)"; if (!lowFx) for (const m of motes) { cx.globalAlpha = 0.2 + 0.3 * Math.sin(t + m.x * 9); cx.beginPath(); cx.arc(m.x * W, m.y * H, m.s, 0, 6.28); cx.fill(); } cx.globalAlpha = 1;
      cx.restore();
      if (flash) { cx.fillStyle = flashCol; cx.globalAlpha = Math.min(0.45, flash); cx.fillRect(0, 0, W, H); cx.globalAlpha = 1; }
      // the lucky gem tints the edges with a rainbow
      if (boosts[2] > now()) { const hue = (t * 60) % 360; cx.save(); cx.strokeStyle = `hsla(${hue},90%,65%,.45)`; cx.lineWidth = 10; cx.shadowColor = `hsl(${hue},90%,65%)`; cx.shadowBlur = 24; cx.strokeRect(5, 5, W - 10, H - 10); cx.restore(); }
      if (jackpot) drawJackpot(gg);
      if (bigText) drawBig(gg);
      if (payday) drawPayday(gg);
      if (card) drawCard(gg);
      const v = cx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.78);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.5)"); cx.fillStyle = v; cx.fillRect(0, 0, W, H);
    }
    function drawJackpot(gg) {
      cx.save(); cx.globalAlpha = Math.min(1, jackpot * 1.6);
      const r = cx.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, Math.max(W, H) * 0.6); r.addColorStop(0, "rgba(195,139,255,.55)"); r.addColorStop(1, "rgba(195,139,255,0)"); cx.fillStyle = r; cx.fillRect(0, 0, W, H);
      cx.translate(W / 2, H * 0.38); cx.rotate(t * 0.8); cx.fillStyle = "rgba(255,255,255,.12)"; for (let i = 0; i < 12; i++) { cx.rotate(Math.PI / 6); cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(-30, -Math.max(W, H)); cx.lineTo(30, -Math.max(W, H)); cx.fill(); }
      cx.restore(); cx.save(); cx.globalAlpha = Math.min(1, jackpot * 1.6);
      drawImg("ore-arc", W / 2, H * 0.38, Math.min(170, H * 0.42), { ay: 0.5, glow: "#c38bff", blur: 40, sx: 1 + 0.05 * Math.sin(t * 8), sy: 1 + 0.05 * Math.sin(t * 8) });
      cx.font = `900 ${gg.mob ? 26 : 40}px Sora, Inter, sans-serif`; cx.textAlign = "center"; cx.lineWidth = 7; cx.strokeStyle = "rgba(30,0,60,.8)"; cx.strokeText(tr("ARC CRYSTAL JACKPOT"), W / 2, H * 0.63); cx.fillStyle = "#f0e2ff"; cx.fillText(tr("ARC CRYSTAL JACKPOT"), W / 2, H * 0.63);
      cx.restore();
    }
    function drawPayday(gg) {
      cx.save(); const a = Math.min(1, payday * 2); cx.globalAlpha = a;
      const k = 1 - payday, y = H * 0.42 - 20 * Math.sin(k * 3.14);
      drawImg("prop-chestopen", W / 2, y + 40, Math.min(130, H * 0.32), { glow: "#ffd35c", blur: 30, sx: 1 + 0.06 * Math.sin(t * 10), sy: 1 + 0.06 * Math.sin(t * 10) });
      cx.font = `900 ${gg.mob ? 20 : 30}px Sora, Inter, sans-serif`; cx.textAlign = "center"; cx.lineWidth = 6; cx.strokeStyle = "rgba(40,25,0,.8)";
      cx.strokeText(paydayText, W / 2, y + 80); cx.fillStyle = "#ffe08a"; cx.fillText(paydayText, W / 2, y + 80);
      cx.restore();
    }
    function drawCard(gg) {
      const a = card.t < 0.3 ? card.t / 0.3 : card.t > 2.3 ? Math.max(0, (2.8 - card.t) / 0.5) : 1;
      cx.save(); cx.globalAlpha = a;
      const w = Math.min(W * 0.8, 420), h = 86, x = (W - w) / 2, y = H * 0.18 - (1 - a) * 20;
      cx.fillStyle = "rgba(8,10,18,.82)"; roundRect(x, y, w, h, 18); cx.fill(); cx.strokeStyle = "rgba(255,200,97,.6)"; cx.lineWidth = 2; cx.stroke();
      drawImg(LAYER_ICON[card.l], x + 46, y + h / 2, 56, { ay: 0.5 });
      cx.textAlign = "left"; cx.fillStyle = "#ffc861"; cx.font = "800 12px Sora, Inter, sans-serif"; cx.fillText(tr("NEW LAYER"), x + 86, y + 34);
      cx.fillStyle = "#fff"; cx.font = `900 ${gg.mob ? 18 : 24}px Sora, Inter, sans-serif`; cx.fillText(`${card.l + 1} · ${tr(layerNames[card.l]).toUpperCase()}`, x + 86, y + 62);
      cx.restore();
    }
    // the builder: wind-up, strike, recover — with a trail for the better pickaxes
    function drawBuilder(gg) {
      const bob = idle ? Math.sin(t * 2.2) * 2 : 0;
      cx.save(); cx.fillStyle = "rgba(0,0,0,.4)"; cx.beginPath(); cx.ellipse(gg.bx, gg.fy - 2, gg.ch * 0.26, gg.ch * 0.05, 0, 0, 6.28); cx.fill(); cx.restore();
      const ph = idle ? -1 : swingT;
      let rot = 0, sx = 1, sy = 1, dx = 0;
      if (ph >= 0) {
        if (ph < 0.45) { const k = ph / 0.45; rot = -0.14 * k; sy = 1 + 0.05 * k; sx = 1 - 0.03 * k; dx = -6 * k; }
        else if (ph < 0.62) { const k = (ph - 0.45) / 0.17; rot = -0.14 + 0.34 * k; sy = 1.05 - 0.12 * k; sx = 0.97 + 0.08 * k; dx = -6 + 16 * k; }
        else { const k = (ph - 0.62) / 0.38; rot = 0.2 * (1 - k); sy = 0.93 + 0.07 * k; sx = 1.05 - 0.05 * k; dx = 10 * (1 - k); }
      }
      const trail = TRAIL[tier];
      if (trail && ph >= 0.45 && ph < 0.75) {
        const k = (ph - 0.45) / 0.3, cxp = gg.bx + gg.ch * 0.1, cyp = gg.fy - gg.ch * 0.6, r = gg.ch * 0.55;
        cx.save(); cx.lineCap = "round"; cx.lineWidth = gg.ch * 0.07; cx.globalAlpha = 0.75 * (1 - k);
        if (trail === "arc") { const g = cx.createLinearGradient(cxp - r, cyp - r, cxp + r, cyp + r); g.addColorStop(0, "#4d9fff"); g.addColorStop(0.5, "#35d8d0"); g.addColorStop(1, "#c38bff"); cx.strokeStyle = g; } else cx.strokeStyle = trail;
        cx.shadowColor = trail === "arc" ? "#c38bff" : trail; cx.shadowBlur = 18;
        cx.beginPath(); cx.arc(cxp, cyp, r, -1.9 + k * 0.4, -0.2 + k * 0.5); cx.stroke(); cx.restore();
        if (trail === "arc" || tier >= 6) for (let i = 0; i < 2; i++) parts.push({ x: cxp + r * Math.cos(-0.4), y: cyp + r * Math.sin(-0.4), vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 80, life: 0.5, s: 2, rot: 0, vr: 0, col: trail === "arc" ? "#9fe8ff" : trail, star: true, g: 120 });
      }
      // the apprentice has real frames (idle, wind-up, strike, skill, celebrate); everyone else is animated by transform
      if (look.char === "apprentice" && ok(img("anim-idle"))) {
        let f = "anim-idle", hm = 1, ax = 0.5;
        if (celebrate > 0 && ok(img("anim-celebrate"))) { f = "anim-celebrate"; hm = 1.09; }
        else if (skillT > 0 && ok(img("anim-skill"))) { f = "anim-skill"; hm = 1.2; ax = 0.45; }
        else if (ph >= 0 && ph < 0.45 && ok(img("anim-mine"))) { f = "anim-mine"; hm = 1.13; ax = 0.4; }
        else if (ph >= 0.45 && ph < 0.75 && ok(img("anim-hit"))) { f = "anim-hit"; hm = 1.04; ax = 0.36; }
        const br = idle ? Math.sin(t * 2.4) * 0.018 : 0;
        drawImg(f, gg.bx + dx * 0.5, gg.fy + bob, gg.ch * 0.92 * hm, { ax, sx: (lookBack > 0 ? -1 : 1) * (1 - br * 0.5), sy: 1 + br });
        return;
      }
      if (idle) { const br = Math.sin(t * 2.4) * 0.02; sy *= 1 + br; sx *= 1 - br * 0.6; if (celebrate > 0) { sy *= 1 + Math.abs(Math.sin(t * 12)) * 0.05; } }
      drawImg("char-" + look.char, gg.bx + dx, gg.fy + bob, gg.ch, { rot, sx: lookBack > 0 ? -sx : sx, sy });
    }
    function drawBig(gg) {
      const k = bigText.t / bigText.dur, a = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
      cx.save(); cx.globalAlpha = a;
      const r = cx.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.4, Math.max(W, H) * 0.55); r.addColorStop(0, "rgba(255,107,139,.45)"); r.addColorStop(1, "rgba(255,107,139,0)"); cx.fillStyle = r; cx.fillRect(0, 0, W, H);
      drawImg("ore-heart", W / 2, H * 0.36, Math.min(160, H * 0.4), { ay: 0.5, glow: bigText.col, blur: 40, sx: 1 + 0.05 * Math.sin(t * 8), sy: 1 + 0.05 * Math.sin(t * 8) });
      cx.font = `900 ${gg.mob ? 26 : 40}px Sora, Inter, sans-serif`; cx.textAlign = "center"; cx.lineWidth = 7; cx.strokeStyle = "rgba(60,0,20,.8)";
      cx.strokeText(bigText.text, W / 2, H * 0.62); cx.fillStyle = "#ffe0e8"; cx.fillText(bigText.text, W / 2, H * 0.62);
      cx.font = `900 ${gg.mob ? 18 : 24}px Sora, Inter, sans-serif`; cx.strokeText(bigText.sub, W / 2, H * 0.62 + 34); cx.fillStyle = bigText.col; cx.fillText(bigText.sub, W / 2, H * 0.62 + 34);
      cx.restore();
    }
    // October: a pumpkin with a glowing face, and bats
    function pumpkin(x, y, r) {
      cx.save(); cx.translate(x, y - r * 0.9);
      if (!lowFx) { cx.shadowColor = "#ff8a2a"; cx.shadowBlur = 14; }
      for (const [ox, rx] of [[-r * 0.55, r * 0.6], [r * 0.55, r * 0.6], [0, r * 0.75]]) { cx.fillStyle = "#e0661c"; cx.beginPath(); cx.ellipse(ox, 0, rx, r * 0.85, 0, 0, 6.28); cx.fill(); }
      cx.shadowBlur = 0; cx.fillStyle = "#3c7a2a"; cx.fillRect(-2, -r * 1.05, 4, r * 0.35);
      const fl = 0.75 + 0.25 * Math.sin(t * 9 + x); cx.fillStyle = `rgba(255,${200 + 40 * fl | 0},90,${fl})`;
      cx.beginPath(); cx.moveTo(-r * 0.45, -r * 0.15); cx.lineTo(-r * 0.2, -r * 0.15); cx.lineTo(-r * 0.32, -r * 0.4); cx.fill();
      cx.beginPath(); cx.moveTo(r * 0.45, -r * 0.15); cx.lineTo(r * 0.2, -r * 0.15); cx.lineTo(r * 0.32, -r * 0.4); cx.fill();
      cx.beginPath(); cx.moveTo(-r * 0.45, r * 0.2); cx.lineTo(0, r * 0.45); cx.lineTo(r * 0.45, r * 0.2); cx.lineTo(0, r * 0.3); cx.fill();
      cx.restore();
    }
    function bat(x, y, s, ph) {
      const f = Math.sin(ph) * 0.8;
      cx.save(); cx.translate(x, y); cx.scale(s * 1.4, s * 1.4); cx.fillStyle = "rgba(10,4,16,.9)";
      cx.beginPath(); cx.moveTo(0, 0); cx.quadraticCurveTo(-6, -6 * f - 2, -12, -2 * f); cx.quadraticCurveTo(-8, 1, -5, 3); cx.quadraticCurveTo(-2, 1, 0, 3);
      cx.quadraticCurveTo(2, 1, 5, 3); cx.quadraticCurveTo(8, 1, 12, -2 * f); cx.quadraticCurveTo(6, -6 * f - 2, 0, 0); cx.fill(); cx.restore();
    }
    // the pet — and how each one reacts to a find
    function drawPet(gg) {
      const px = gg.bx - gg.ch * 0.66, ph = gg.ch * 0.46, j = pet.jump, id = look.pet;
      let dy = Math.abs(Math.sin(t * 2.6)) * 4, rot = 0, sx = 1, sy = 1, dxp = 0;
      if (j > 0) {
        const k = Math.sin(j * Math.PI);
        if (id === "arccat" || id === "corgi") { dy = k * 34; rot = id === "corgi" ? (1 - j) * 6.28 : 0; }
        else if (id === "slime") { sy = 1 - 0.3 * Math.sin(j * 9) * j; sx = 1 + 0.25 * Math.sin(j * 9) * j; dy = k * 10; }
        else if (id === "mole") { dy = -k * ph * 0.7; }
        else if (id === "picko") { rot = Math.sin(t * 30) * 0.25 * j; dy = k * 18; }
        else if (id === "orego") { dy = k * 16; if (j < 0.15 && !reduce) shake = Math.max(shake, 0.35); }
        else if (id === "arcia") { dy = k * 14; dxp = k * 6; }
      }
      cx.save(); cx.fillStyle = "rgba(0,0,0,.35)"; cx.beginPath(); cx.ellipse(px, gg.fy - 2, ph * 0.34, ph * 0.08, 0, 0, 6.28); cx.fill(); cx.restore();
      if (id === "mole" && j > 0) { cx.save(); cx.beginPath(); cx.rect(px - ph, gg.fy - ph * 2, ph * 2, ph * 2); cx.clip(); drawImg("pet-mole", px, gg.fy - dy, ph); cx.restore(); for (let i = 0; i < 2; i++) parts.push({ x: px + (Math.random() - 0.5) * 20, y: gg.fy - 4, vx: (Math.random() - 0.5) * 120, vy: -80 - Math.random() * 80, life: 0.6, s: 3, rot: 0, vr: 4, col: LAYER_COL[layerIdx()][0] }); }
      else drawImg("pet-" + id, px + dxp, gg.fy - dy, ph, { rot, sx, sy, glow: id === "orego" || id === "arcia" ? "#6fb6ff" : null, blur: 10 });
      if (HALLOWEEN) { const hx0 = px + dxp + ph * 0.05, hy0 = gg.fy - dy - ph * 0.9; cx.save(); cx.fillStyle = "#2a1640"; cx.beginPath(); cx.moveTo(hx0 - ph * 0.22, hy0); cx.lineTo(hx0 + ph * 0.22, hy0); cx.lineTo(hx0 + ph * 0.05, hy0 - ph * 0.38); cx.closePath(); cx.fill(); cx.fillRect(hx0 - ph * 0.3, hy0 - 3, ph * 0.6, 5); cx.fillStyle = "#ff8a2a"; cx.fillRect(hx0 - ph * 0.16, hy0 - 8, ph * 0.32, 4); cx.restore(); }
      if (id === "arcia" && j > 0.3) { const f = face(); cx.save(); cx.strokeStyle = `rgba(120,220,255,${j})`; cx.lineWidth = 3; cx.shadowColor = "#7ff6ff"; cx.shadowBlur = 16; cx.beginPath(); cx.moveTo(px + ph * 0.1, gg.fy - dy - ph * 0.6); cx.lineTo(f.x, f.y); cx.stroke(); cx.restore(); }
    }
    return {
      mount, start, stop, size, share, chips, drop, onCollect: null, onLow: null, onCartOut: null,
      layer() { return layerIdx(); },
      light() { return lowFx; },
      skill() { skillT = 0.8; },
      newHour() { cartMode = "in"; cartOff = 520; },
      // a tap on the pet makes it react; returns true when the tap hit it
      tap(x, y) {
        const g = geo(), px = g.bx - g.ch * 0.66, ph = g.ch * 0.46;
        if (Math.abs(x - px) < ph * 0.6 && y < g.fy + 6 && y > g.fy - ph * 1.1) { pet.jump = 1; for (let i = 0; i < 6; i++) parts.push({ x: px, y: g.fy - ph, vx: (Math.random() - 0.5) * 120, vy: -120 - Math.random() * 80, life: 1, s: 4, rot: 0, vr: 0, col: "#ff8fb0", star: true, g: 200 }); Sound.ore("silver"); return true; }
        return false;
      },
      set(o) {
        if (o.depth != null) targetDepth = Math.max(0.02, Math.min(0.985, o.depth));
        if (o.jump) depth = targetDepth;
        if (o.descend) { depth = 0; descend = 3; }
        if (o.idle != null) { idle = o.idle; if (!idle && swingT >= 1) swingT = 0; }
        if (o.label != null) label = o.label;
        if (o.layers) layerNames = o.layers;
        if (o.look) look = { ...look, ...o.look };
        if (o.tier != null) tier = o.tier;
        if (o.boosts) boosts = o.boosts;
        if (o.cart) cart = o.cart;
        if (o.others) others = o.others;
        if (o.rush != null) rush = o.rush;
        if (o.hourLeft != null) { if (o.hourLeft > hourLeft + 60) { cartMode = "in"; cartOff = 520; } hourLeft = o.hourLeft; }
      },
      newLayer(l) { card = { l, t: 0 }; chips(24, 1.3); sparkle(20, "#ffe3ad"); shake = reduce ? 0 : 0.5; Sound.level(); },
      payday(text) { payday = 1; paydayText = text; sparkle(60, "#ffd35c"); Sound.jackpot(); },
    };
  })();

  // =====================================================================================
  // the frame
  // =====================================================================================
  const svgI = {
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6L8 10z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  };
  function frame() {
    const body = $("bm-body");
    if (!body) return;
    body.innerHTML = `
      <div class="bm-prof" id="bm-prof"></div>
      <div class="bm-livestrip" id="bm-live" aria-label="${T("Across every mine")}"></div>
      <div class="bm-banner" id="bm-banner" hidden></div>
      <div class="bm-worldbar" id="bm-worldbar"></div>
      <div class="bm-world" id="bm-world" hidden></div>
      <div class="bm-mines" id="bm-mines" role="list" aria-label="${T("Mines")}"></div>
      <div class="bm-minehead" id="bm-minehead" hidden></div>
      <div class="bm-steps" id="bm-steps" aria-label="${T("How to start")}"></div>
      <div class="bm-stage" id="bm-stage">
        <canvas id="bm-canvas" aria-label="${T("The mine, drawn live")}" role="img"></canvas>
        <div class="bm-hud tl" id="bm-hud-tl"></div>
        <div class="bm-hud tr" id="bm-hud-tr"></div>
        <div class="bm-hud bl" id="bm-hud-bl"></div>
        <div class="bm-tools"><button type="button" class="bm-ico" data-act="sound" aria-label="${T("Sound")}" aria-pressed="${S.sound}">${S.sound ? svgI.sound : svgI.mute}</button><button type="button" class="bm-ico" data-act="full" aria-label="${T("Full screen")}">${svgI.full}</button><button type="button" class="bm-ico bm-inst" data-act="install" aria-label="${T("Install the app")}" title="${T("Install the app")}" hidden><img src="${src("ui-home")}" alt="" width="20" height="20"></button><span class="bm-lightchip" id="bm-light" hidden>${T("Light mode")}</span></div>
        <div class="bm-dock">
          <button type="button" class="bm-go" id="bm-go"><img class="bm-go-pick" src="${src("pick-iron")}" alt="" width="26" height="26"><span class="bm-go-ico" aria-hidden="true"></span><b>${T("Start mining")}</b></button>
          <div class="bm-power" role="radiogroup" aria-label="${T("Power")}" id="bm-power"></div>
        </div>
        <div class="bm-gauge" id="bm-gauge" aria-hidden="true"></div>
        <div class="bm-flyers" id="bm-flyers" aria-hidden="true"></div>
        <div class="bm-ftoasts" id="bm-ftoasts" aria-hidden="true"></div>
        <div class="bm-result" id="bm-result" hidden></div>
        <div class="bm-forge" id="bm-forge" hidden></div>
        <div class="bm-tip" id="bm-tip" hidden></div>
        <div class="bm-intro" id="bm-intro" hidden></div>
      </div>
      <div class="bm-sr" id="bm-sr" aria-live="polite" role="status"></div>
      <div class="bm-tabs" role="tablist" id="bm-tabs" aria-label="${T("Builder Mine")}"></div>
      <div class="bm-tabbody" id="bm-tabbody" role="tabpanel"></div>`;
    Scene.mount($("bm-canvas"));
    Scene.set({ layers: G().layers });
    Scene.onCollect = collect;
    Scene.onLow = () => { const l = $("bm-light"); if (l) l.hidden = false; toast("Light mode: fewer effects, so mining stays smooth on this device."); };
    $("bm-canvas").addEventListener("click", (e) => { const r = e.currentTarget.getBoundingClientRect(); Scene.tap(e.clientX - r.left, e.clientY - r.top); });
    $("bm-tabs").addEventListener("keydown", tabKeys);
    if (HALLOWEEN) panel.classList.add("bm-hw");
    if (S.installEvt) { const ib = body.querySelector(".bm-inst"); if (ib) ib.hidden = false; }
    $("bm-go").addEventListener("click", toggleMining);
    body.addEventListener("click", onClick);
    body.addEventListener("submit", onSubmit);
    body.addEventListener("change", onChange);
    paintPower();
    watchStage();
    if (!lsGet("bm.intro")) showIntro();
  }
  function paintPower() {
    const max = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    $("bm-power").innerHTML = `<span>${T("Power")}</span>` + Array.from({ length: max }, (_, i) => `<button type="button" role="radio" aria-checked="${S.power === i + 1}" data-power="${i + 1}" class="${S.power === i + 1 ? "on" : ""}">${i + 1}</button>`).join("");
  }

  // ---------------- the first visit: the mine's entrance, then a short tour ----------------
  function showIntro() {
    const el = $("bm-intro");
    if (!el) return;
    el.hidden = false;
    el.innerHTML = `<div class="bm-intro-in">
      <div class="bm-intro-art"><img src="${src("env-forest")}" alt="" width="480" height="472"><div class="bm-intro-crew">${G().characters.map((c, i) => `<img src="${src("char-" + c.id)}" alt="" style="--i:${i}">`).join("")}</div></div>
      <h2>${T("Welcome to Builder Mine")}</h2>
      <p>${T("Pick a mine, press Start, and your builder digs with your browser. Every hour the mine pays out by the work done. Rare ores, pickaxes, pets and ranks make it a game.")}</p>
      <div class="bm-row center"><button type="button" class="bm-go" data-act="enter"><b>${T("Enter the mine")}</b></button><button type="button" class="bm-mini" data-act="skip">${T("Skip")}</button></div>
    </div>`;
  }
  const TOUR = [
    ["Press Start. Your builder swings for real — your browser does the hashing, only while this tab is open.", "go"],
    ["Every swing that lands is a share, +1 point. Rare ores add more: copper to the Arc Crystal jackpot. The bar at the top shows when the next one is due.", "tr"],
    ["Each hour the mine pays out by points × pickaxe × bonuses. In a live mine: join, post once on X, then claim. Pick your builder and pet below.", "tabs"],
  ];
  function tour(i) {
    const el = $("bm-tip");
    if (!el) return;
    if (i >= TOUR.length) { el.hidden = true; lsSet("bm.intro", "1"); return; }
    el.hidden = false; el.dataset.at = TOUR[i][1];
    el.innerHTML = `<img src="${src("pet-" + myLook().pet)}" alt="" width="54" height="54"><div><p>${T(TOUR[i][0])}</p><div class="bm-row"><span class="bm-sm">${i + 1} / ${TOUR.length}</span><button type="button" class="bm-mini hot" data-act="tour" data-i="${i + 1}">${T(i + 1 < TOUR.length ? "Next" : "Got it")}</button></div></div>`;
  }

  // ---------------- the world: every mine — as cards, or as islands on the Arc World map ----------------
  const BIOMES = ["env-grass", "env-forest", "env-snow", "env-lava", "env-crystal"];
  const biome = (id) => (id === "practice" ? "env-forest" : BIOMES[Number(id) % BIOMES.length]);
  const STATUS_TXT = { live: "Live", soon: "Soon", paused: "Paused", ended: "Ended", closed: "Ended" };
  function tokenFace(tok, size) {
    const a = tok && tok.address, logo = a && S.logo[a], sym = (tok && tok.symbol) || "?";
    return logo ? `<img class="bm-tk" src="${esc(logo)}" alt="" width="${size}" height="${size}" referrerpolicy="no-referrer" loading="lazy">`
      : `<span class="bm-tk ph" style="${a && typeof window.arcAvatarBg === "function" ? window.arcAvatarBg(a) : ""};width:${size}px;height:${size}px">${esc(sym.slice(0, 1).toUpperCase())}</span>`;
  }
  function mineCard(m) {
    const sym = m.token ? m.token.symbol : "?", dec = m.token ? m.token.decimals : 18, name = (m.info && m.info.name) || "";
    const left = m.status === "live" || m.status === "paused" ? dur(m.end - now()) : m.status === "soon" ? tr("opens in") + " " + dur(m.start - now()) : tr(m.status === "closed" ? "closed" : "ended");
    const sf = S.safety[m.token && m.token.address], risky = sf != null && sf < 40;
    return `<button type="button" role="listitem" class="bm-mc ${S.id === m.id ? "on" : ""} st-${m.status} ${risky ? "risky" : ""}" data-mine="${m.id}">
      <span class="bm-mc-art" style="background-image:url(${src(biome(m.id))})"><em class="bm-st">${T(STATUS_TXT[m.status] || "Ended")}</em>${sf != null ? `<em class="bm-safe ${sf >= 70 ? "hi" : sf >= 40 ? "mid" : "lo"}" title="${T("Token Scanner score")}">${sf}</em>` : ""}${tokenFace(m.token, 34)}</span>
      <span class="bm-mc-top"><b data-no-i18n>$${esc(sym)}</b>${name ? `<i data-no-i18n>${esc(name)}</i>` : ""}</span>
      <span class="bm-mc-amt" data-no-i18n>${compact(units(m.deposited, dec))}</span>
      <span class="bm-mc-sub">${T("Layer")} ${m.layer + 1}/6 · ${fmtN(m.builders)} ${T("builders")}</span>
      <span class="bm-mc-bar"><i style="width:${Math.min(100, (units(m.emittedNow, dec) / Math.max(1e-18, units(m.deposited, dec))) * 100).toFixed(1)}%"></i></span>
      <span class="bm-mc-sub">${esc(left)}</span>${risky ? `<span class="bm-risk">${T("Low scanner score — check the token first")}</span>` : ""}</button>`;
  }
  function shownMines() {
    const f = S.filter || "all", sort = S.sort || "new";
    let list = S.list.filter((m) => f === "all" || (f === "live" ? m.status === "live" || m.status === "paused" : f === "soon" ? m.status === "soon" : m.status === "ended" || m.status === "closed"));
    const left = (m) => units(BigInt(m.deposited) - BigInt(m.emittedNow || 0), m.token ? m.token.decimals : 18);
    if (sort === "builders") list = [...list].sort((x, y) => y.builders - x.builders);
    else if (sort === "left") list = [...list].sort((x, y) => (y.status === "live") - (x.status === "live") || (y.end - x.end));
    else if (sort === "rich") list = [...list].sort((x, y) => left(y) - left(x));
    else list = [...list].sort((x, y) => y.id - x.id);
    return list;
  }
  function paintMines() {
    const el = $("bm-mines");
    if (!el) return;
    paintWorldBar();
    const list = shownMines();
    const cards = list.map(mineCard);
    if (S.practice) cards.unshift(`<button type="button" role="listitem" class="bm-mc ${S.id === "practice" ? "on" : ""} st-live" data-mine="practice"><span class="bm-mc-art" style="background-image:url(${src(biome("practice"))})"><em class="bm-st">${T("Free")}</em></span><span class="bm-mc-top"><b>${T("Practice")}</b></span><span class="bm-mc-amt">${T("No rewards")}</span><span class="bm-mc-sub">${T("Same game — try your pickaxe")}</span><span class="bm-mc-bar"><i style="width:${Math.min(100, S.local.dug * 100).toFixed(1)}%"></i></span><span class="bm-mc-sub">${T("Nothing is sent or paid")}</span></button>`);
    if (!list.length && S.list.length) cards.push(`<div class="bm-empty sm" role="listitem"><img src="${src("pet-mole")}" alt="" width="54" height="54"><p>${T("No mine matches that filter.")}</p></div>`);
    cards.push(`<button type="button" role="listitem" class="bm-mc bm-mc-new" data-act="open"><img src="${src("prop-chestgems")}" alt="" width="64" height="64"><b>${T("Open a mine")}</b><span class="bm-mc-sub">${T("Put part of your token's supply in the ground")}</span></button>`);
    el.innerHTML = cards.join("");
    el.hidden = S.worldView === "map";
    paintWorld();
    // Token Scanner scores (and logos) for the cards, once each (the free /api/v1/scan)
    S.list.forEach((m) => {
      const a = m.token && m.token.address;
      if (!a || S.safety[a] !== undefined) return;
      S.safety[a] = null;
      fetch(`/api/v1/scan/${a}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
        if (!j) return;
        const sc = j.score != null ? j.score : j.result && j.result.score;
        const logo = findImage(j);
        if (logo) S.logo[a] = logo;
        if (sc != null) S.safety[a] = Math.round(sc);
        paintMines(); paintMineHead();
      }).catch(() => {});
    });
  }
  function findImage(o, d = 0) {
    if (!o || typeof o !== "object" || d > 4) return null;
    for (const [k, v] of Object.entries(o)) if (/^(image|imageUrl|logo|icon)$/i.test(k) && typeof v === "string" && /^https:\/\/[^\s"<>]+$/.test(v)) return v;
    for (const v of Object.values(o)) if (v && typeof v === "object") { const r = findImage(v, d + 1); if (r) return r; }
    return null;
  }
  function paintWorldBar() {
    const el = $("bm-worldbar");
    if (!el) return;
    const n = (f) => S.list.filter((m) => f === "live" ? m.status === "live" || m.status === "paused" : f === "soon" ? m.status === "soon" : m.status === "ended" || m.status === "closed").length;
    const chip = (k, label, c) => `<button type="button" class="${(S.filter || "all") === k ? "on" : ""}" data-bmfilter="${k}">${T(label)}${c != null ? ` <em data-no-i18n>${c}</em>` : ""}</button>`;
    el.innerHTML = `<div class="bm-seg" role="group" aria-label="${T("View")}"><button type="button" class="${S.worldView !== "map" ? "on" : ""}" data-bmview="cards" aria-pressed="${S.worldView !== "map"}">${T("Cards")}</button><button type="button" class="${S.worldView === "map" ? "on" : ""}" data-bmview="map" aria-pressed="${S.worldView === "map"}"><img src="${src("map-pin")}" alt="" width="12" height="16">${T("Arc World")}</button></div>
      ${S.list.length ? `<div class="bm-filters">${chip("all", "All", S.list.length)}${chip("live", "Live", n("live"))}${chip("soon", "Soon", n("soon"))}${chip("ended", "Ended", n("ended"))}</div>
      <label class="bm-sort"><span>${T("Sort")}</span><select id="bm-sort" aria-label="${T("Sort mines")}">${[["new", "Newest"], ["left", "Time left"], ["builders", "Most builders"], ["rich", "Most left to mine"]].map(([k, l]) => `<option value="${k}" ${(S.sort || "new") === k ? "selected" : ""}>${T(l)}</option>`).join("")}</select></label>` : ""}`;
  }
  // the Arc World map: every mine is an island (pins in fixed spots over the art)
  const SLOTS = [[8, 64], [19, 44], [35, 40], [64, 44], [76, 38], [88, 44], [95, 26], [28, 20], [57, 16], [81, 14], [13, 20], [44, 74], [70, 74], [90, 72]];
  function paintWorld() {
    const el = $("bm-world");
    if (!el) return;
    el.hidden = S.worldView !== "map";
    if (el.hidden) return;
    const list = shownMines().slice(0, SLOTS.length - 1);
    const pin = (x, y, id, label, sub, st, on) => `<button type="button" class="bm-pin st-${st} ${on ? "on" : ""}" style="left:${x}%;top:${y}%" data-mine="${id}" aria-label="${esc(label)} ${esc(sub)}">
      <img src="${src(on ? "map-pin" : st === "soon" ? "mm-event" : "mm-mine")}" alt="" width="34" height="34"><b data-no-i18n>${esc(label)}</b><em>${esc(sub)}</em></button>`;
    const pins = list.map((m, i) => pin(SLOTS[i + (S.practice ? 1 : 0)][0], SLOTS[i + (S.practice ? 1 : 0)][1], m.id, "$" + (m.token ? m.token.symbol : "?"), `${fmtN(m.builders)} ${tr("builders")} · ${tr(STATUS_TXT[m.status] || "Ended")}`, m.status, S.id === m.id));
    if (S.practice) pins.unshift(pin(SLOTS[0][0], SLOTS[0][1], "practice", tr("Practice"), tr("Free"), "live", S.id === "practice"));
    el.innerHTML = `<div class="bm-world-in"><img class="bm-world-art" src="${src("world-map")}" alt="${T("Arc World: every mine is an island")}" width="1600" height="216">
      <span class="bm-world-hub" style="left:51%;top:46%">ARCIRCLE</span>${pins.join("")}</div>
      <p class="bm-sm">${T("Every mine is an island in Arc World. Tap one to enter it.")}${S.list.length > SLOTS.length - 1 ? " " + T("The busiest mines are shown — switch to Cards for all of them.") : ""}</p>`;
  }
  // the numbers across every mine, at the top of the page
  let liveShown = {};
  function paintLive() {
    const el = $("bm-live");
    if (!el) return;
    const st = S.stats;
    const item = (icon, label, key, val, sub, act) => `<${act ? `button type="button" ${act}` : "div"} class="bm-li"><img src="${src(icon)}" alt="" width="30" height="30"><span><em>${T(label)}</em><b data-no-i18n ${key ? `data-count="${key}" data-to="${val == null ? "" : val}"` : ""}>${key ? esc(fmtCount(liveShown[key] != null ? liveShown[key] : 0)) : esc(val)}</b>${sub ? `<i data-no-i18n>${sub}</i>` : ""}</span></${act ? "button" : "div"}>`;
    if (!S.live || !st || !st.live) {
      el.innerHTML = item("mm-mine", "Practice mine", null, tr("Free · no rewards")) + item("coin-arc", "$ARCIRCLE burned", null, tr("Counting starts at launch")) + item("mm-player", "Your shares here", "shares", S.local.shares) + (HALLOWEEN ? item("mm-event", "October", null, tr("Pumpkins in the mine")) : "");
    } else {
      const burned = st.burned ? units(st.burned, 18) : 0, today = st.burnedToday ? units(st.burnedToday, 18) : 0;
      el.innerHTML = item("coin-arc", "$ARCIRCLE burned", "burned", burned, today > 0 ? `+${compact(today)} ${tr("today")}` : "") +
        item("mm-player", "Digging now", "digging", st.digging || 0, `${fmtN(st.joined)} ${tr("builders in")} ${fmtN(st.liveMines)} ${tr(st.liveMines === 1 ? "mine" : "mines")}`) +
        (st.hottest ? item("fx-gold", "Hottest mine this hour", null, "$" + st.hottest.symbol, `${fmtN(st.hottest.points)} ${tr("pts")}`, `data-mine="${st.hottest.id}"`) : item("mm-mine", "Live mines", "mines", st.liveMines || 0)) +
        item("ore-arc", "Arc Crystals found", "hall", st.hall || 0);
    }
    // count up from what was shown before
    el.querySelectorAll("[data-count]").forEach((b) => {
      const k = b.dataset.count, to = Number(b.dataset.to || 0), from = liveShown[k] != null ? liveShown[k] : 0;
      if (reduce || from === to) { b.textContent = fmtCount(to); liveShown[k] = to; return; }
      const t0 = performance.now(), D = 1100;
      const stepN = (ts) => { const k2 = Math.min(1, (ts - t0) / D), e = 1 - Math.pow(1 - k2, 3); b.textContent = fmtCount(from + (to - from) * e); if (k2 < 1) requestAnimationFrame(stepN); else liveShown[k] = to; };
      requestAnimationFrame(stepN);
    });
  }
  const fmtCount = (n) => (n >= 1e4 ? compact(n) : fmtN(Math.round(n)));
  // your builder, always in view: rank, points to the next rank — and the mining status when the mine scrolls away
  function paintProf() {
    const el = $("bm-prof");
    if (!el) return;
    const g = G(), r = myRank(), rk = g.ranks[r] || g.ranks[0], nx = g.ranks[r + 1], pts = lifetime(), lk = myLook(), c = card() || {};
    const pct = nx ? Math.max(0, Math.min(100, ((pts - rk.min) / (nx.min - rk.min)) * 100)) : 100;
    const who = c.x || (S.me && S.me.x) ? "@" + (c.x || S.me.x) : state.account ? short(state.account) : tr("Guest builder");
    const hr = hashRate(), me = S.me, cap = me ? me.cap : g.cap;
    const shares = S.id === "practice" ? S.local.shares : me && me.hour ? me.hour.shares + S.queue.length : 0;
    const ci = c.crewInfo;
    el.classList.toggle("mining", S.mining);
    el.innerHTML = `<button type="button" class="bm-prof-av" data-act="tab" data-tab="builder" aria-label="${T("Your builder")}"><img src="${src("char-" + lk.char)}" alt="" width="34" height="44"></button>
      <img class="bm-prof-rk" src="${src("badge-" + rk.id)}" alt="" width="30" height="30">
      <div class="bm-prof-t"><b data-no-i18n>${esc(who)}</b><span>${T(rk.name)} · <em data-no-i18n>${fmtN(pts)}${nx ? " / " + fmtN(nx.min) : ""}</em> ${T("pts")}</span><span class="bm-xpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct.toFixed(0)}" aria-label="${T("To the next rank")}"><i style="width:${pct.toFixed(1)}%"></i></span></div>
      ${ci ? `<span class="bm-prof-crew" title="${T("Crew bonus")}"><img src="${src("mm-crew")}" alt="" width="18" height="18"><b data-no-i18n>${esc(ci.name)}</b>${ci.pct ? `<em>+${ci.pct}%</em>` : ""}</span>` : ""}
      ${S.mining ? `<span class="bm-prof-mine"><i aria-hidden="true"></i><b data-no-i18n>${hr ? (hr / 1e3).toFixed(0) + " kH/s" : "—"}</b><span data-no-i18n>${fmtN(Math.min(shares, cap))}/${fmtN(cap)}</span></span>${S.stageOut ? `<button type="button" class="bm-mini bm-back" data-act="totop" aria-label="${T("Back to the mine")}"><img src="${src("ui-pick")}" alt="" width="18" height="18"><span>${T("Back to the mine")}</span></button><button type="button" class="bm-mini" data-act="stop">${T("Stop")}</button>` : ""}` : ""}`;
  }
  function paintBanner() {
    const el = $("bm-banner");
    if (!el) return;
    if (S.setup) { el.hidden = false; el.innerHTML = `<b>${T("Setting up")}</b> ${T("The Builder Mine contract is on Arc. Mining opens as soon as the server side is switched on — until then, the practice mine is open.")}`; return; }
    if (!S.live) { el.hidden = false; el.innerHTML = `<b>${T("Practice mine")}</b> ${T("The Builder Mine contract isn't live on Arc yet. Mine here for fun — the game is the same, but nothing is sent, paid or claimed.")}`; return; }
    const rd = S.cfg && S.cfg.ready;
    if (S.cfg && S.cfg.joinsPaused) { el.hidden = false; el.innerHTML = `<b>${T("Paused")}</b> ${T("New mines and joins are paused for a moment. Mining, claims and burns carry on.")}`; return; }
    if (rd && (!rd.secret || !rd.store)) { el.hidden = false; el.innerHTML = `<b>${T("Setting up")}</b> ${T("Mining opens as soon as the server side is switched on.")}`; return; }
    el.hidden = true;
  }
  // the mine you're in: its name, line and link, the numbers, and the creator's tools
  function paintMineHead() {
    const el = $("bm-minehead"), v = S.view;
    if (!el) return;
    if (!v || S.id === "practice") { el.hidden = true; return; }
    el.hidden = false;
    const dec = v.token ? v.token.decimals : 18, sym = v.token ? v.token.symbol : "", info = v.info || {}, link = safeLink(info.link);
    const mine = me0() && v.creator === me0();
    const sf = S.safety[v.token && v.token.address];
    el.innerHTML = `<div class="bm-mh-art" style="background-image:url(${src(biome(S.id))})">${tokenFace(v.token, 40)}</div>
      <div class="bm-mh-t"><b data-no-i18n>${esc(info.name || "$" + sym + " mine")}</b>${sf != null ? `<span class="bm-safe ${sf >= 70 ? "hi" : sf >= 40 ? "mid" : "lo"} inl" title="${T("Token Scanner score")}">${T("Scan")} ${sf}</span>${sf < 40 ? ` <a class="bm-risklink" href="/s/${esc(v.token.address)}" target="_blank" rel="noopener">${T("Low score — read the scan first")}</a>` : ""}` : ""}${info.about ? `<p data-no-i18n>${esc(info.about)}</p>` : ""}
        <span class="bm-sm">$${esc(sym)} · ${T("by")} <span data-no-i18n>${short(v.creator)}</span>${link ? ` · <a href="${esc(link)}" target="_blank" rel="noopener nofollow" data-no-i18n>${esc(link.replace(/^https:\/\//, "").slice(0, 32))}</a>` : ""}${v.paused ? ` · <em class="bm-st">${T("Joins paused")}</em>` : ""}</span></div>
      <div class="bm-mh-k"><div><span>${T("In the mine")}</span><b data-no-i18n>${compact(units(v.deposited, dec))}</b></div><div><span>${T("Mined")}</span><b data-no-i18n>${compact(units(v.emittedNow, dec))}</b></div><div><span>${T("Digging now")}</span><b data-no-i18n>${fmtN((v.active && v.active.n) || 0)}</b></div><div><span>${T("Builders")}</span><b data-no-i18n>${fmtN(v.builders)}</b></div></div>
      <div class="bm-mh-a"><button type="button" class="bm-mini" data-act="dash"><img src="${src("ui-trophy")}" alt="" width="16" height="16">${T(mine ? "Your mine's dashboard" : "Mine stats")}</button>${now() < v.end - 3600 ? `<button type="button" class="bm-mini" data-act="topup">${T("Top up")}</button>` : ""}<button type="button" class="bm-mini" data-act="copy" data-copy="${esc(v.link)}">${T("Share mine")}</button>${mine ? `<button type="button" class="bm-mini" data-act="editinfo">${T("Edit")}</button><button type="button" class="bm-mini" data-act="pausemine">${T(v.paused ? "Resume joins" : "Pause joins")}</button>` : ""}</div>`;
  }

  // ---------------- steps ----------------
  function paintSteps() {
    const el = $("bm-steps");
    if (!el) return;
    if (S.id === "practice" || !S.view) { el.innerHTML = ""; return; }
    const me = S.me || {};
    const steps = [
      ["Connect", !!state.account, state.account ? "" : `<button type="button" class="bm-mini" data-act="connect">${T("Connect")}</button>`],
      ["Join · 1 USDC in $ARCIRCLE, burned", !!me.joined, me.joined || !state.account ? "" : `<button type="button" class="bm-mini hot" data-act="join">${T("Join")}</button>`],
      ["Mine", (me.hour && me.hour.shares > 0) || BigInt(me.mined || 0) > 0n, ""],
      ["Post on X", !!me.verified, me.joined && !me.verified ? `<button type="button" class="bm-mini" data-act="tab" data-tab="proof">${T("Post")}</button>` : ""],
      ["Claim", BigInt((me.claimable && me.claimable.claimed) || 0) > 0n, ""],
    ];
    const cur = steps.findIndex((s) => !s[1]);
    el.innerHTML = `<ol>${steps.map((s, i) => `<li class="${s[1] ? "done" : i === cur ? "cur" : ""}"><i>${s[1] ? "✓" : i + 1}</i><span>${T(s[0])}</span>${i === cur ? s[2] : ""}</li>`).join("")}</ol>`;
  }

  // ---------------- the HUD ----------------
  function hashRate() { return Object.values(S.rates).reduce((n, x) => n + x, 0); }
  function curBits() { return S.id === "practice" && S.tutorial > 0 ? G().shareBits - 5 : (S.work && S.work.bits) || G().shareBits; }
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
    if (S.lastLayer >= 0 && layer > S.lastLayer && S.booted) Scene.newLayer(layer);
    S.lastLayer = layer;
    const ores = S.id === "practice" ? S.local.ores : (me && me.hour && me.hour.ores) || {};
    const hourLeft = v && v.hourEndsIn != null && S.id !== "practice" && now() < v.end ? Math.max(0, v.hourEndsIn - (now() - (S.viewAt || now()))) : null;
    const ev = S.id !== "practice" && v && v.events ? v.events : null;
    Scene.set({ depth: frac, look: myLook(), label: sym ? `$${sym}` : tr("Practice mine"), tier: (me && me.pickaxe) || 0, boosts: (me && me.boosts) || [0, 0, 0, 0], cart: ores, others: ((v && v.active && v.active.who) || []).filter((x) => x.w !== me0()).map((x) => (x.look && x.look.char) || "apprentice"), rush: ev ? ev.rush : "", hourLeft: hourLeft == null ? 9999 : hourLeft });
    const rushO = ev && (g.ores || []).find((o) => o.kind === ev.rush);
    tl.innerHTML = `<b>${T("Layer")} ${layer + 1} · ${T(g.layers[layer])}</b><span>${esc(leftTxt)}</span>${hourLeft != null ? `<span class="${hourLeft <= 10 ? "bm-cartgo" : ""}">${T(hourLeft <= 10 ? "The cart is leaving" : "Payout in")} <em data-no-i18n>${dur(hourLeft)}</em></span>` : ""}
      ${rushO ? `<span class="bm-ev rush" title="${T("This hour's rush ore: its points ×3")}"><img src="${src("ore-" + rushO.kind)}" alt="" width="16" height="16">${T("Rush")}: ${T(rushO.name)} ×${ev.rushMult || 3}</span>` : ""}
      ${ev ? `<span class="bm-ev heart ${ev.heart.found ? "found" : ""}"><img src="${src("ore-heart")}" alt="" width="16" height="16">${ev.heart.found ? `${T("Heart of Arc found by")} <em data-no-i18n>${ev.heart.w === me0() ? tr("you") : short(ev.heart.w)}</em>` : T("Heart of Arc: hidden this hour")}</span>` : ""}`;
    const hr = hashRate(), cap = me ? me.cap : g.cap;
    const shares = S.id === "practice" ? S.local.shares : me && me.hour ? me.hour.shares + S.queue.length : 0;
    // the next share: expected hashes = 2^bits; how far along we are at this rate
    const expect = 2 ** curBits(), since = S.mining && hr ? ((Date.now() - S.lastShareAt) / 1000) * hr : 0, p = Math.min(1, since / expect);
    const eta = S.mining && hr ? Math.max(0, (expect - since) / hr) : null;
    trr.classList.toggle("open", !!S.hudOpen);
    trr.innerHTML = `<button type="button" class="bm-hudtog" data-act="hud" aria-expanded="${!!S.hudOpen}" aria-label="${T("Show more")}">${S.hudOpen ? "−" : "+"}</button><b data-no-i18n>${hr ? (hr >= 1e6 ? (hr / 1e6).toFixed(2) + " MH/s" : (hr / 1e3).toFixed(0) + " kH/s") : "— H/s"}</b>
      <span>${T("This hour")} <em data-no-i18n>${fmtN(Math.min(shares, cap))} / ${fmtN(cap)}</em></span>
      <span class="bm-capbar"><i style="width:${Math.min(100, (shares / Math.max(1, cap)) * 100).toFixed(1)}%"></i></span>
      <span class="bm-next ${p >= 1 ? "due" : ""}">${S.mining ? (eta != null && p < 1 ? `${T("Next share")} ~${Math.ceil(eta)}s` : T("Any moment…")) : T("Press Start")}</span>
      <span class="bm-nextbar"><i style="width:${(p * 100).toFixed(1)}%"></i></span>
      ${me && me.estimate && me.estimate !== "0" && v ? `<span>${T("This hour")} ≈ <em data-no-i18n>${compact(units(me.estimate, v.token ? v.token.decimals : 18))} $${esc(sym)}</em></span>` : ""}`;
    const mult = me && me.weight ? me.weight.mult : 1;
    const pt = Math.min(g.pickaxes.length - 1, (me && me.pickaxe) || 0), pick = g.pickaxes[pt];
    const rk = g.ranks[myRank()] || g.ranks[0];
    bl.innerHTML = `<span class="bm-chip pk t${pt}"><img src="${src("pick-" + pick.id)}" alt="" width="20" height="20">${T(pick.name)}</span><span class="bm-chip mult" title="${T("Pickaxe × (1 + bonuses)")}">×${mult.toFixed(2)}</span>` +
      `<span class="bm-chip rk"><img src="${src("badge-" + rk.id)}" alt="" width="18" height="18">${T(rk.name)}</span>` +
      `<span class="bm-chip ores" id="bm-ores">${(g.ores || []).map((o) => `<i data-ore="${o.kind}" title="${T(o.name)}"><img src="${src("ore-" + o.kind)}" alt="${T(o.name)}" width="16" height="16"><b data-no-i18n>${fmtN(ores[o.kind] || 0)}</b></i>`).join("")}</span>` +
      (me && me.hour && me.hour.of ? `<span class="bm-chip">${T("Your share of this hour")} <b data-no-i18n>${((me.hour.points / Math.max(1, me.hour.of)) * 100).toFixed(1)}%</b></span>` : "") +
      (S.shareFind && S.shareFind.until > now() ? `<button type="button" class="bm-chip share" data-act="sharecard" data-card="${S.shareFind.card}" data-k="${S.shareFind.k || ""}"><img src="${src(S.shareFind.k ? "ore-" + S.shareFind.k : "badge-" + rk.id)}" alt="" width="18" height="18">${T("Share this on X")}</button>` : "");
    gauge.innerHTML = g.layers.map((n, i) => `<i class="${i < layer ? "past" : i === layer ? "now" : ""}" style="--c:${LAYER_COL[i][0]}" title="${T(n)}"><img src="${src(LAYER_ICON[i])}" alt="" width="20" height="20"><span>${T(n)}</span></i>`).join("") + `<b style="top:${(frac * 100).toFixed(1)}%"></b>`;
    if (S.gaugeLayer != null && layer > S.gaugeLayer) { gauge.classList.remove("whoosh"); void gauge.offsetWidth; gauge.classList.add("whoosh"); }
    S.gaugeLayer = layer;
    if (go) {
      const can = S.id === "practice" || (v && me && me.joined && now() >= v.start && now() < v.end);
      go.classList.toggle("on", S.mining);
      go.classList.toggle("off", !can && !S.mining);
      go.querySelector("b").textContent = tr(S.mining ? "Stop" : S.capHit ? "Hourly cap reached" : S.id === "practice" ? "Start mining" : !state.account ? "Connect to mine" : v && me && !me.joined ? "Join to mine" : "Start mining");
    }
    paintMini(hr, shares, cap);
  }
  // a found ore flies from the rock into its counter in the HUD
  function collect(kind, x, y) {
    const box = $("bm-flyers"), stage = $("bm-stage"), dst = document.querySelector(`#bm-ores [data-ore="${kind}"]`);
    if (!box || !stage || !dst || reduce) return;
    const sr = stage.getBoundingClientRect(), dr = dst.getBoundingClientRect();
    const el = document.createElement("img"); el.src = src("ore-" + kind); el.className = "bm-fly"; el.alt = "";
    el.style.left = x + "px"; el.style.top = y + "px";
    box.appendChild(el);
    requestAnimationFrame(() => { el.style.transform = `translate(${dr.left - sr.left + 8 - x}px, ${dr.top - sr.top + 8 - y}px) scale(.35)`; el.style.opacity = "0.2"; });
    setTimeout(() => { el.remove(); dst.classList.remove("bump"); void dst.offsetWidth; dst.classList.add("bump"); }, 650);
  }
  // when the stage scrolls away while mining, the profile bar at the top shows the mining status
  function paintMini() { paintProf(); }
  // the site's floating bars (dock, quick bar, ARCIA) step aside while the mine fills the screen
  function watchStage() {
    const stage = $("bm-stage");
    if (!stage || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        const inView = e.isIntersecting && e.intersectionRatio > 0.25;
        document.documentElement.classList.toggle("bm-focus", inView && panel.classList.contains("active"));
        S.stageOut = !e.isIntersecting || e.intersectionRatio < 0.15;
        paintMini(hashRate(), 0, 0); paintHud();
      }
    }, { threshold: [0, 0.15, 0.25, 0.5, 1] });
    io.observe(stage);
  }

  // =====================================================================================
  // the tabs
  // =====================================================================================
  // four main tabs (the UI concept's Mine, Builder, Shop, Claim) and two more — on phones those two sit under More
  const TABS = [["mine", "Mining", "ui-pick"], ["builder", "Builder", "ui-home"], ["shop", "Shop", "ui-gift"], ["claim", "Claim", "ui-crystal"], ["board", "Leaderboards", "ui-trophy", 1], ["how", "How it works", "ui-scroll", 1]];
  const OLD_TABS = { rig: "shop", boosts: "shop", proof: "mine" };
  function paintTabs() {
    const el = $("bm-tabs");
    if (!el) return;
    if (OLD_TABS[S.tab]) S.tab = OLD_TABS[S.tab];
    const extraOn = TABS.some(([k, , , x]) => x && k === S.tab);
    el.innerHTML = TABS.map(([k, n, ic, x]) => `<button type="button" role="tab" id="bm-t-${k}" aria-selected="${S.tab === k}" aria-controls="bm-tabbody" tabindex="${S.tab === k ? 0 : -1}" class="${S.tab === k ? "on" : ""} ${x ? "extra" : ""}" data-tab="${k}"><img src="${src(ic)}" alt="" width="26" height="26"><span>${T(n)}</span></button>`).join("") +
      `<button type="button" class="more ${extraOn ? "on" : ""}" data-act="more" aria-haspopup="true" aria-expanded="${!!S.moreOpen}"><img src="${src("ui-gear")}" alt="" width="26" height="26"><span>${T("More")}</span></button>` +
      (S.moreOpen ? `<div class="bm-more" role="menu">${TABS.filter((x) => x[3]).map(([k, n, ic]) => `<button type="button" role="menuitem" data-tab="${k}"><img src="${src(ic)}" alt="" width="22" height="22">${T(n)}</button>`).join("")}</div>` : "");
    const b = $("bm-tabbody");
    b.setAttribute("aria-labelledby", "bm-t-" + S.tab);
    b.innerHTML = S.tab === "builder" ? tabBuilder() : S.tab === "shop" ? tabShop() : S.tab === "mine" ? tabMine() : S.tab === "board" ? tabBoard() : S.tab === "claim" ? tabClaim() : tabHow();
    if (S.tab === "claim") loadClaims();
    if (S.tab === "mine" && S.id !== "practice") drawDash();
  }
  // arrow keys move between the tabs (the ones you can see)
  function tabKeys(e) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = [...$("bm-tabs").querySelectorAll('[role="tab"]')].filter((x) => x.offsetParent !== null);
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const j = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    S.tab = tabs[j].dataset.tab; paintTabs();
    const nb = $("bm-t-" + S.tab); if (nb) nb.focus();
  }
  const empty = (pet, text, extra) => `<div class="bm-empty"><img src="${src("pet-" + pet)}" alt="" width="72" height="72" loading="lazy"><p>${T(text)}</p>${extra || ""}</div>`;
  function itemsList() {
    return S.cfg && Array.isArray(S.cfg.items) && S.cfg.items.length ? S.cfg.items : G().items.map(([p, tier, boost, d], id) => ({ id, price: (BigInt(p) * 10n ** 18n).toString(), tier, boost, duration: d, active: true }));
  }
  const arcAmt = (raw) => compact(units(raw, 18));

  // ---------------- your builder: looks, rank, badges, quests, crew ----------------
  function card() { return S.me || S.bd || null; }
  function myRank() { const c = card(); return (c && c.rank) || 0; }
  function lifetime() { const c = card(); return (c && c.lifetime) || 0; }
  function myLook() {
    const g = G(), r = myRank(), saved = S.look || {}, server = (card() && card().look) || {};
    const c = g.characters.find((x) => x.id === saved.char && x.rank <= r) || g.characters.find((x) => x.id === server.char) || g.characters[0];
    const p = g.pets.find((x) => x.id === saved.pet && x.rank <= r) || g.pets.find((x) => x.id === server.pet) || g.pets[0];
    return { char: c.id, pet: p.id };
  }
  function tabBuilder() {
    const g = G(), r = myRank(), lk = myLook(), pts = lifetime(), c = card() || {};
    const rk = g.ranks[r], nx = g.ranks[r + 1];
    const pct = nx ? Math.min(100, ((pts - rk.min) / (nx.min - rk.min)) * 100) : 100;
    const look = (x, kind, on) => { const lock = x.rank > r; return `<button type="button" class="bm-look ${on ? "on" : ""} ${lock ? "lock" : ""}" data-look="${kind}" data-id="${x.id}" ${lock ? `aria-disabled="true" title="${T("Unlocks at")} ${T(g.ranks[x.rank].name)}"` : ""}>
      <img src="${src(kind + "-" + x.id)}" alt="" loading="lazy"><b>${T(x.name)}</b>${lock ? `<em><img src="${src("badge-" + g.ranks[x.rank].id)}" alt="" width="14" height="14">${T(g.ranks[x.rank].name)}</em>` : ""}</button>`; };
    const qs = c.quests;
    const quests = qs ? `<div class="bm-quests">${qs.list.map((q) => `<div class="bm-q ${q.done ? "done" : ""} ${q.claimed ? "claimed" : ""}"><b>${T(q.name)}</b><span class="bm-capbar"><i style="width:${((q.have / q.goal) * 100).toFixed(0)}%"></i></span><em data-no-i18n>${fmtN(q.have)}/${fmtN(q.goal)} · +${q.xp} XP</em></div>`).join("")}
      <div class="bm-q bonus ${qs.bonus.done ? "done" : ""}"><b>${T("All three today")}</b><em data-no-i18n>+${qs.bonus.xp} XP</em></div></div>
      <div class="bm-row"><button type="button" class="bm-mini hot" data-act="quests" ${qs.list.some((q) => q.done && !q.claimed) || (qs.bonus.done && !qs.bonus.claimed) ? "" : "disabled"}>${T("Claim quest XP")}</button><span class="bm-sm">${T("New quests in")} ${dur(qs.resetsIn)}</span></div>`
      : empty("corgi", S.live ? "Connect your wallet to see today's quests." : "Daily quests start with the live mines: dig 100 shares, find gold or better, share your mine on X — each gives rank XP.");
    const ach = (c.achievements || g.achievements.map((a) => ({ ...a, got: false }))).map((a) => `<div class="bm-ach ${a.got ? "got" : ""}" title="${T(a.about)}"><img src="${src(ACH_ART[a.id] || "ore-copper")}" alt="" loading="lazy"><b>${T(a.name)}</b><span>${T(a.about)}</span></div>`).join("");
    const ci = c.crewInfo, tiers = g.crewTiers || [];
    const crew = c.crew ? `<div class="bm-crew has"><img src="${src("mm-crew")}" alt="" width="44" height="44"><div><b data-no-i18n>${esc(ci ? ci.name : c.crew)}</b><span class="bm-sm">${ci ? `${fmtN(ci.n)}/30 ${T("builders")} · ${fmtN(ci.season)} ${T("pts this month")}` : T("Your crew — see it on the Leaderboards tab")}</span>
        ${ci ? `<span class="bm-crewbar"><i style="width:${Math.min(100, (ci.season / Math.max(1, (ci.next ? ci.next.at : ci.season || 1))) * 100).toFixed(1)}%"></i>${tiers.map(([at, pct]) => `<em style="left:${Math.min(100, (at / (tiers[tiers.length - 1][0])) * 100)}%">+${pct}%</em>`).join("")}</span>
        <span class="bm-sm">${ci.pct ? `${T("Crew bonus")} <b>+${ci.pct}%</b> ${T("for every member this month.")}` : ""} ${ci.next ? `${fmtN(ci.next.at - ci.season)} ${T("more points to")} +${ci.next.pct}%` : T("Top crew bonus reached.")}</span>` : ""}</div>
        <button type="button" class="bm-mini" data-act="crewleave">${T("Leave")}</button></div>`
      : `<form class="bm-crew" id="bm-crewf"><img src="${src("mm-crew")}" alt="" width="44" height="44"><input id="bm-crewn" maxlength="20" placeholder="${T("Crew name")}" aria-label="${T("Crew name")}" ${state.account && S.live ? "" : "disabled"}><button type="submit" class="bm-mini green" data-crew="create" ${state.account && S.live ? "" : "disabled"}>${T("Found")}</button><button type="submit" class="bm-mini" data-crew="join" ${state.account && S.live ? "" : "disabled"}>${T("Join")}</button></form>`;
    // the ore book: every ore, how many, when first found
    const bookRows = c.book || [...(g.ores || []).map((o) => ({ kind: o.kind, n: S.id === "practice" ? S.local.ores[o.kind] || 0 : 0, first: null })), { kind: "heart", n: 0, first: null }];
    const oreName = (k) => (k === "heart" ? (g.heart && g.heart.name) || "Heart of Arc" : ((g.ores || []).find((o) => o.kind === k) || {}).name || k);
    const found = bookRows.filter((x) => x.n > 0).length;
    const book = `<div class="bm-book">${bookRows.map((x) => `<div class="bm-bk ${x.n ? "got" : ""} k-${x.kind}"><img src="${src("ore-" + x.kind)}" alt="" loading="lazy"><b>${T(oreName(x.kind))}</b><span data-no-i18n>${x.n ? "×" + fmtN(x.n) : "?"}</span><em>${x.first ? new Date(x.first * 1000).toISOString().slice(0, 10) : x.n ? "" : T("not found yet")}</em></div>`).join("")}</div>`;
    const prefs = c.prefs || {};
    const settings = `<div class="bm-settings">
      <label class="bm-switch"><input type="checkbox" data-act="xshare" ${prefs.xshare ? "checked" : ""} ${state.account && S.live ? "" : "disabled"}><span></span><b>${T("Let ARCIA post my Arc Crystal on X")}</b><em>${T("She tags your proven X account when you find the jackpot ore. Off by default.")}</em></label>
      <a class="bm-setrow" href="https://t.me/ARCIAonArc_bot?start=mine" target="_blank" rel="noopener"><img src="${src("pet-arcia")}" alt="" width="36" height="36"><span><b>${T("Claim alerts on Telegram")}</b><em>${T("ARCIA tells you when you can claim, and before unclaimed coins get burned. Link your wallet once.")}</em></span></a>
    </div>`;
    return `<div class="bm-builder">
      <div class="bm-bstage">
        <img class="bm-bchar" src="${src("char-" + lk.char)}" alt="${T((g.characters.find((x) => x.id === lk.char) || {}).name || "")}">
        <img class="bm-bpet" src="${src("pet-" + lk.pet)}" alt="">
        <div class="bm-brank"><img src="${src("badge-" + rk.id)}" alt="" width="48" height="48"><div><b>${T(rk.name)}</b><span data-no-i18n>${fmtN(pts)} ${T("pts")}${nx ? ` / ${fmtN(nx.min)}` : ""}</span><span class="bm-capbar"><i style="width:${pct.toFixed(1)}%"></i></span>${nx ? `<small>${T("Next")}: ${T(nx.name)} (+${nx.pct}%)</small>` : `<small>${T("Top rank")}</small>`}</div></div>
      </div>
      <div class="bm-bpick">
        <h3>${T("Characters")}</h3><div class="bm-looks">${g.characters.map((x) => look(x, "char", x.id === lk.char)).join("")}</div>
        <h3>${T("Pets & companions")}</h3><div class="bm-looks pets">${g.pets.map((x) => look(x, "pet", x.id === lk.pet)).join("")}</div>
        <p class="bm-note">${T("Looks only — they don't change your mining. Rank up with lifetime points to unlock more.")}</p>
      </div></div>
      <div class="bm-grid2">
        <div><h3><img class="bm-h3i" src="${src("ui-calendar")}" alt="" width="22" height="22">${T("Daily quests")}</h3>${quests}</div>
        <div><h3><img class="bm-h3i" src="${src("ui-crew")}" alt="" width="22" height="22">${T("Crew")}</h3>${crew}<p class="bm-note">${T("Crews of up to 30 builders compete on the monthly board. Joining a crew is free.")}</p></div>
      </div>
      <div class="bm-grid2"><div><h3>${T("Ore book")} <span class="bm-sm" data-no-i18n>${found}/${bookRows.length}</span></h3>${book}${found ? `<button type="button" class="bm-mini" data-act="sharecard" data-card="book">${T("Share my ore book")}</button>` : ""}</div>
        <div><h3>${T("Settings")}</h3>${settings}</div></div>
      <h3>${T("Badges")}</h3><div class="bm-achs">${ach}</div>`;
  }
  function tabRig() {
    const me = S.me || {}, have = me.pickaxe || 0, items = itemsList();
    const priceOf = (tier) => { const x = items.find((i) => i.tier === tier); return x ? BigInt(x.price) : 0n; };
    const cards = G().pickaxes.map((p) => {
      const owned = p.tier <= have, next = p.tier === have + 1;
      const cost = p.tier === 0 ? 0n : priceOf(p.tier) - (have > 0 ? priceOf(have) : 0n);
      const it = items.find((i) => i.tier === p.tier);
      return `<div class="bm-pick t${p.tier} ${owned ? "own" : ""} ${p.tier === have ? "cur" : ""}">
        <span class="bm-pick-art" aria-hidden="true"><img src="${src("pick-" + p.id)}" alt="" width="72" height="72" loading="lazy"></span>
        <b>${T(p.name)}</b><span class="bm-pick-x">×${p.mult.toFixed(2).replace(/0$/, "")}</span>
        <span class="bm-pick-p">${p.tier === 0 ? T("Everyone starts here") : owned ? T("Owned") : `<img src="${src("coin-arc")}" alt="" width="14" height="14"><em data-no-i18n>${arcAmt(cost)}</em> $ARCIRCLE`}</span>
        ${!owned && it && it.active ? `<button type="button" class="bm-mini ${next ? "hot" : ""}" data-act="buy" data-item="${it.id}">${T(have ? "Upgrade & burn" : "Buy & burn")}</button>` : ""}
      </div>`;
    }).join("");
    return `<p class="bm-note">${T("A pickaxe is yours for good and works in every mine. An upgrade costs only the difference. Every $ARCIRCLE you pay is burned. Better pickaxes leave a trail when they strike.")}</p><div class="bm-picks">${cards}</div>`;
  }
  function tabShop() {
    const bal = S.arcBal != null ? `<span class="bm-bal"><img src="${src("coin-arc")}" alt="" width="18" height="18">${T("You hold")} <b data-no-i18n>${compact(units(S.arcBal, 18))}</b> $ARCIRCLE</span>` : "";
    return `<div class="bm-shophead"><h3>${T("Pickaxes")}</h3>${bal}</div>${tabRig()}<h3 class="bm-h3gap">${T("Boosts")}</h3>${tabBoosts()}`;
  }
  function tabBoosts() {
    const me = S.me || {}, items = itemsList().filter((i) => i.boost > 0), until = me.boosts || [0, 0, 0, 0];
    const t = now();
    const cards = items.map((i) => {
      const b = G().boosts.find((x) => x.kind === i.boost) || {};
      const left = until[i.boost - 1] - t;
      return `<div class="bm-boost k${i.boost} ${left > 0 ? "live" : ""}">
        <span class="bm-boost-art" aria-hidden="true"><img src="${src(BOOST_ART[i.boost])}" alt="" width="60" height="60" loading="lazy"></span>
        <b>${T(b.name || "Boost")}</b><span>${T(b.effect || "")}</span>
        <span class="bm-pick-p"><img src="${src("coin-arc")}" alt="" width="14" height="14"><em data-no-i18n>${arcAmt(i.price)}</em> $ARCIRCLE</span>
        ${left > 0 ? `<span class="bm-live">${T("Active")} · ${dur(left)}</span>` : ""}
        ${i.active ? `<button type="button" class="bm-mini" data-act="buy" data-item="${i.id}" ${S.id === "practice" || !me.joined ? "disabled" : ""}>${T(left > 0 ? "Extend & burn" : "Light & burn")}</button>` : ""}
      </div>`;
    }).join("");
    return `<p class="bm-note">${T("Boosts belong to one mine and run for a set time — you'll see them in the mine. Buy them after you join. The $ARCIRCLE is burned.")}</p><div class="bm-boosts">${cards}</div>`;
  }
  // the cards you can post: each one's claim is checked on the server before it's drawn
  function cardOptions() {
    const me = S.me || {}, c = card() || {}, ores = (me.totals && me.totals.ores) || (c.totals && c.totals.ores) || {};
    const o = [{ card: "", label: "Builder card", icon: "char-" + myLook().char }];
    if (ores.arc) o.push({ card: "jackpot", k: "arc", label: "Arc Crystal", icon: "ore-arc" });
    if (ores.heart) o.push({ card: "jackpot", k: "heart", label: "Heart of Arc", icon: "ore-heart" });
    if (ores.diamond) o.push({ card: "jackpot", k: "diamond", label: "Diamond", icon: "ore-diamond" });
    o.push({ card: "rank", label: "Rank", icon: "badge-" + (G().ranks[myRank()] || G().ranks[0]).id });
    if (me.season > 0) o.push({ card: "season", label: "Season", icon: "ui-trophy" });
    if (c.crew || me.crew) o.push({ card: "crew", label: "Crew", icon: "mm-crew" });
    if ((me.book || c.book || []).some((x) => x.n > 0)) o.push({ card: "book", label: "Ore book", icon: "ui-scroll" });
    return o;
  }
  function tweetText(pick) {
    const v = S.view, sym = v && v.token ? v.token.symbol : "";
    const c = card() || {}, rk = G().ranks[myRank()] || G().ranks[0], ci = c.crewInfo, book = (c.book || []).filter((x) => x.n > 0).length;
    // posts stay in English (they go out on X, where the mine's builders read them)
    const p = pick || {};
    if (p.card === "jackpot" && p.k === "arc") return `I just hit an Arc Crystal (1 in 16,384 shares) mining $${sym} in Builder Mine on ARCIRCLE PAD ♾\n\nDig with me:`;
    if (p.card === "jackpot" && p.k === "heart") return `I reached the Heart of Arc first this hour, mining $${sym} in Builder Mine on ARCIRCLE PAD ♾\n\nDig with me:`;
    if (p.card === "jackpot") return `Found a diamond mining $${sym} in Builder Mine on ARCIRCLE PAD ♾\n\nDig with me:`;
    if (p.card === "rank") return `${rk.name} rank in Builder Mine on ARCIRCLE PAD ♾ Every share on Arc counts.\n\nMine $${sym} with me:`;
    if (p.card === "season") return `My season so far in Builder Mine on ARCIRCLE PAD ♾\n\nMine $${sym} with me:`;
    if (p.card === "crew") return `${ci ? "Crew " + ci.name : "My crew"} is digging on Arc in Builder Mine on ARCIRCLE PAD ♾\n\nJoin us:`;
    if (p.card === "book") return `${book} of 6 ores in my Builder Mine ore book on ARCIRCLE PAD ♾\n\nMine $${sym} with me:`;
    return `I'm a builder on Arc, mining $${sym} in Builder Mine on ARCIRCLE PAD ♾\n\nJoin and dig with me:`;
  }
  function tabProof() {
    const me = S.me || {}, v = S.view;
    if (S.id === "practice" || !v) return `<p class="bm-note">${T("In a live mine, your first X post unlocks claiming, and every post on a new day adds +5% (up to +25%). Builders who join through your link add +5% each (up to +25%).")}</p>`;
    if (!state.account) return `<p class="bm-note">${T("Connect your wallet to get your card and link.")}</p>`;
    const opts = cardOptions(), pick = opts.find((o) => S.cardPick && o.card === S.cardPick.card && (o.k || "") === (S.cardPick.k || "")) || opts[0];
    const q = pick.card ? `&c=${pick.card}${pick.k ? "&k=" + pick.k : ""}` : "";
    const link = `${location.origin}/mine/${S.id}?r=${me0()}${q}`;
    const cardUrl = `/api/og?mine=${S.id}&w=${me0()}${q}&t=${Math.floor(Date.now() / 60000)}`;
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(tweetText(pick))}&url=${encodeURIComponent(link)}`;
    return `<div class="bm-proof">
      <div><div class="bm-cardpick" role="radiogroup" aria-label="${T("Pick a card")}">${opts.map((o) => `<button type="button" role="radio" aria-checked="${o === pick}" class="${o === pick ? "on" : ""}" data-act="pickcard" data-card="${o.card}" data-k="${o.k || ""}"><img src="${src(o.icon)}" alt="" width="20" height="20">${T(o.label)}</button>`).join("")}</div>
      <div class="bm-card-prev"><img src="${esc(cardUrl)}" alt="${T("Your Builder Mine card")}" loading="lazy" width="600" height="315"></div></div>
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
  // the Mine tab: post & invite (with the share cards), this mine's board and finds, its numbers
  function tabMine() {
    const v = S.view;
    if (S.id === "practice" || !v) return `<div class="bm-grid2"><div>${empty("arccat", "This is the practice mine: the same game, but nothing is paid. Pick a live mine to mine for real.")}</div><div>${tabProof()}</div></div>`;
    const dec = v.token ? v.token.decimals : 18, mine = me0();
    const who = (w, x) => (x ? "@" + esc(x) : short(w));
    const rows = (v.top || []).map((r, i) => `<li class="${r.w === mine ? "me" : ""}"><i>${i + 1}</i><span data-no-i18n>${who(r.w, r.x)}</span><b data-no-i18n>${compact(units(r.amt, dec))}</b><em data-no-i18n>${fmtN(r.pts)} ${T("pts")}</em></li>`).join("");
    const found = { gold: "found gold", diamond: "found a diamond", arc: "found an Arc Crystal", heart: "reached the Heart of Arc" };
    const feed = (v.feed || []).map((f) => `<li class="k-${f.kind}"><img class="bm-ore" src="${src("ore-" + f.kind)}" alt="" width="22" height="22"><span data-no-i18n>${short(f.w)}</span><b>${T(found[f.kind] || "found an ore")}</b><em>${dur(now() - f.t)} ${T("ago")}</em></li>`).join("");
    return `${tabProof()}
      <div class="bm-board bm-gap"><div><h3>${T("Top builders in this mine")}</h3>${rows ? `<ol class="bm-top">${rows}</ol>` : empty("picko", "Settled every hour — the first results appear after the first hour.")}</div>
        <div><h3>${T("Rare finds")}</h3>${feed ? `<ul class="bm-feed">${feed}</ul>` : empty("mole", "No gold, diamonds or Arc Crystals yet.")}</div></div>
      <div class="bm-dashmini" id="bm-dashmini"><h3>${T("This mine, hour by hour")}</h3><div class="bm-sm">${T("Loading…")}</div></div>`;
  }
  function tabBoard() {
    const v = S.view, sub = S.boardTab, b = S.boards || {};
    const tabs = [["season", "Season"], ["crews", "Crews"], ["hall", "Hall of fame"], ["mine", "This mine"]].map(([k, n]) => `<button type="button" class="${sub === k ? "on" : ""}" data-board="${k}">${T(n)}</button>`).join("");
    const who = (w, x) => (x ? "@" + esc(x) : short(w));
    let body = "";
    if (sub === "mine") {
      if (!v) body = empty("picko", "The leaderboard fills as builders mine.");
      else {
        const dec = v.token ? v.token.decimals : 18, mine = me0();
        const rows = (v.top || []).map((r, i) => `<li class="${r.w === mine ? "me" : ""}"><i>${i + 1}</i><span data-no-i18n>${who(r.w, r.x)}</span><b data-no-i18n>${compact(units(r.amt, dec))}</b><em data-no-i18n>${fmtN(r.pts)} ${T("pts")}</em></li>`).join("");
        const found = { gold: "found gold", diamond: "found a diamond", arc: "found an Arc Crystal" };
        const feed = (v.feed || []).map((f) => `<li class="k-${f.kind}"><img class="bm-ore" src="${src("ore-" + f.kind)}" alt="" width="22" height="22"><span data-no-i18n>${short(f.w)}</span><b>${T(found[f.kind] || "found an ore")}</b><em>${dur(now() - f.t)} ${T("ago")}</em></li>`).join("");
        body = `<div class="bm-board"><div><h3>${T("Top builders")}</h3>${rows ? `<ol class="bm-top">${rows}</ol>` : `<p class="bm-note">${T("Settled every hour — the first results appear after the first hour.")}</p>`}</div>
          <div><h3>${T("Rare finds")}</h3>${feed ? `<ul class="bm-feed">${feed}</ul>` : `<p class="bm-note">${T("No gold, diamonds or Arc Crystals yet.")}</p>`}</div></div>`;
      }
    } else if (sub === "season") {
      const s = b.season || {}, mine = me0();
      const rows = (s.top || []).map((r, i) => `<li class="${r.w === mine ? "me" : ""}"><i>${i + 1}</i><span class="bm-who">${r.look ? `<img src="${src("char-" + r.look.char)}" alt="" width="22" height="28">` : ""}<span data-no-i18n>${short(r.w)}</span></span><img src="${src("badge-" + G().ranks[r.rank || 0].id)}" alt="" width="20" height="20"><em data-no-i18n>${fmtN(r.pts)} ${T("pts")}</em></li>`).join("");
      body = `<p class="bm-note">${T("Points in every mine this month.")} ${s.endsIn ? `${T("Season ends in")} ${dur(s.endsIn)}.` : ""}</p>${rows ? `<ol class="bm-top season">${rows}</ol>` : empty("corgi", "No points yet this month.")}`;
    } else if (sub === "crews") {
      const rows = (b.crews || []).map((c, i) => `<li><i>${i + 1}</i><span data-no-i18n>${esc(c.name)}${c.pct ? ` <em class="bm-crewpct">+${c.pct}%</em>` : ""}</span><b data-no-i18n>${fmtN(c.season)} ${T("pts")}</b><em data-no-i18n>${fmtN(c.n)} ${T("builders")}</em></li>`).join("");
      const tiers = (G().crewTiers || []).map(([at, pct]) => `${fmtN(at)} ${tr("pts")} → +${pct}%`).join(" · ");
      body = `<img class="bm-banner-img" src="${src("crew-banner")}" alt="" width="1100" height="210" loading="lazy"><p class="bm-note">${T("A crew's points this month lift every member:")} <span data-no-i18n>${esc(tiers)}</span></p>` + (rows ? `<ol class="bm-top">${rows}</ol>` : empty("slime", "No crews yet — found the first one on the Builder tab."));
    } else {
      const rows = (b.hall || []).map((h) => `<li><img class="bm-ore" src="${src("ore-arc")}" alt="" width="22" height="22"><span data-no-i18n>${short(h.w)}</span><b>${T("Arc Crystal")} · ${T("mine")} #${h.id}</b><em>${new Date(h.t * 1000).toISOString().slice(0, 10)}</em></li>`).join("");
      body = `<div class="bm-hall"><img src="${src("ore-arc")}" alt="" width="70" height="70"><p>${T("Everyone who has found the Arc Crystal — 1 in 16,384 shares — stays here for good.")}</p></div>${rows ? `<ul class="bm-feed">${rows}</ul>` : empty("orego", "Nobody has found one yet.")}`;
    }
    return `<div class="bm-subtabs">${tabs}</div>${body}`;
  }
  function tabClaim() {
    const v = S.view, me = S.me || {};
    if (S.id === "practice" || !v) return `<div class="bm-claim"><img class="bm-chest" src="${src("prop-chestgems")}" alt="" width="120" height="120"><p class="bm-note">${T("Practice finds aren't paid. Pick a live mine to mine for real.")}</p></div><div id="bm-claims"></div>`;
    const dec = v.token ? v.token.decimals : 18, sym = v.token ? v.token.symbol : "";
    const mined = BigInt(me.mined || 0), cum = BigInt((me.claimable && me.claimable.cumulative) || 0), done = BigInt((me.claimable && me.claimable.claimed) || 0);
    const owed = cum > done ? cum - done : 0n;
    const t = now(), ended = t >= v.end, finalBy = v.end + 3 * 86400, burnBy = v.end + 33 * 86400;
    const pending = mined > cum ? mined - cum : 0n;
    return `<div class="bm-claim">
      <img class="bm-chest ${owed > 0n ? "full" : ""}" src="${src(owed > 0n ? "prop-chestopen" : "prop-chestgems")}" alt="" width="120" height="120">
      <div class="bm-kpis">
        <div><span>${T("Mined")}</span><b data-no-i18n>${compact(units(mined, dec))} $${esc(sym)}</b></div>
        <div><span>${T("Claimable now")}</span><b class="hot" data-no-i18n>${compact(units(owed, dec))}</b></div>
        <div><span>${T("Claimed")}</span><b data-no-i18n>${compact(units(done, dec))}</b></div>
      </div>
      ${pending > 0n && !me.verified ? `<p class="bm-warn">${T("You have")} <b data-no-i18n>${compact(units(pending, dec))} $${esc(sym)}</b> ${T("waiting. Prove one X post to unlock it — unproven amounts are burned when the mine ends.")}</p>` : pending > 0n ? `<p class="bm-note">${T("The rest arrives with the next hourly root.")}</p>` : ""}
      <div class="bm-row"><button type="button" class="bm-go small blue" data-act="claim" ${owed > 0n && me.claimable.proof ? "" : "disabled"}><img src="${src("coin-arc")}" alt="" width="20" height="20">${T("Claim")} ${owed > 0n ? `<span data-no-i18n>${compact(units(owed, dec))} $${esc(sym)}</span>` : ""}</button></div>
      <ul class="bm-rules">
        <li>${T("Roots are posted every hour and can only grow.")}</li>
        <li>${T("Claims stay open for 30 days after the final root")} (<span data-no-i18n>${new Date(burnBy * 1000).toISOString().slice(0, 10)}</span>).</li>
        <li>${T("Then anything unclaimed is burned. Nothing ever goes back to the mine's creator.")}</li>
      </ul>
      ${ended && t > finalBy && !v.unminedBurned ? `<button type="button" class="bm-mini" data-act="burn1">${T("Burn the unmined part")}</button>` : ""}
      ${t > burnBy && !v.closed ? `<button type="button" class="bm-mini" data-act="burn2">${T("Burn what's unclaimed and close")}</button>` : ""}
      ${v.burned && v.burned !== "0" ? `<p class="bm-note">${T("Burned so far")}: <b data-no-i18n>${compact(units(v.burned, dec))} $${esc(sym)}</b></p>` : ""}
    </div><div id="bm-claims"></div>`;
  }
  // every mine you have something in: claimable, claimed, when the rest burns — and one transaction for all of it
  async function loadClaims() {
    const box = () => $("bm-claims");
    if (!box()) return;
    if (!S.live || !state.account) { box().innerHTML = `<h3>${T("All your mines")}</h3>` + empty("arcia", S.live ? "Connect your wallet to see what you can claim in every mine." : "When the mines are live, everything you can claim — in every mine — shows up here."); return; }
    const w = me0();
    if (!S.claims || S.claims.w !== w || Date.now() - S.claims.at > 60000) {
      box().innerHTML = `<h3>${T("All your mines")}</h3><p class="bm-sm">${T("Loading…")}</p>`;
      const views = await Promise.all(S.list.slice(0, 20).map((m) => api(`id=${m.id}&w=${w}`).then((j) => ({ m, j })).catch(() => null)));
      const rows = views.filter((x) => x && x.j && !x.j.error && (BigInt(x.j.mined || 0) > 0n || BigInt((x.j.claimable || {}).claimed || 0) > 0n)).map(({ m, j }) => {
        const cum = BigInt(j.claimable.cumulative || 0), done = BigInt(j.claimable.claimed || 0);
        return { id: m.id, sym: m.token ? m.token.symbol : "?", name: (m.info && m.info.name) || "", dec: m.token ? m.token.decimals : 18, mined: BigInt(j.mined || 0), owed: cum > done ? cum - done : 0n, done, cum, proof: j.claimable.proof, burnAt: m.end + 33 * 86400, closed: m.closed, verified: j.verified };
      });
      S.claims = { w, at: Date.now(), rows, gas: null };
      const ready = rows.filter((r) => r.owed > 0n && r.proof);
      const prov = state.signer && state.signer.provider;
      if (ready.length && prov && mineAddr()) {
        const c = new ethers.Contract(mineAddr(), MINE_ABI, state.signer);
        const [g, fd] = await Promise.all([c.claimMany.estimateGas(ready.map((r) => r.id), state.account, ready.map((r) => r.cum), ready.map((r) => r.proof)).catch(() => null), prov.getFeeData().catch(() => null)]);
        const price = fd ? fd.gasPrice || fd.maxFeePerGas || 0n : 0n;
        S.claims.gas = g != null && price ? Number(ethers.formatEther(g * price)) : null; // Arc pays gas in USDC
      }
    }
    const { rows, gas } = S.claims, ready = rows.filter((r) => r.owed > 0n && r.proof);
    if (!box()) return;
    box().innerHTML = `<h3>${T("All your mines")}</h3>` + (rows.length ? `<div class="bm-ctable" role="table" aria-label="${T("All your mines")}">
      <div class="bm-ctr head" role="row"><span role="columnheader">${T("Mine")}</span><span role="columnheader">${T("Claimable")}</span><span role="columnheader">${T("Claimed")}</span><span role="columnheader">${T("Unclaimed burns in")}</span></div>
      ${rows.map((r) => { const left = r.burnAt - now(); return `<div class="bm-ctr ${r.owed > 0n ? "has" : ""}" role="row"><span role="cell"><button type="button" class="bm-link" data-mine="${r.id}" data-no-i18n>$${esc(r.sym)} #${r.id}</button>${r.name ? `<i data-no-i18n>${esc(r.name)}</i>` : ""}</span><span role="cell" class="hot" data-no-i18n>${compact(units(r.owed, r.dec))}${r.owed === 0n && r.mined > r.cum && !r.verified ? ` <em class="bm-needx">${T("post on X to unlock")}</em>` : ""}</span><span role="cell" data-no-i18n>${compact(units(r.done, r.dec))}</span><span role="cell" class="${left < 5 * 86400 ? "warn" : ""}">${r.closed ? T("closed") : left > 0 ? dur(left) : T("now")}</span></div>`; }).join("")}
      </div>
      <div class="bm-row"><button type="button" class="bm-go small blue" data-act="claimall" ${ready.length ? "" : "disabled"}><img src="${src("coin-arc")}" alt="" width="20" height="20">${T(ready.length > 1 ? "Claim from every mine" : "Claim")} ${ready.length ? `<span data-no-i18n>(${ready.length})</span>` : ""}</button>${gas != null ? `<span class="bm-sm">${T("Gas")} ≈ <b data-no-i18n>$${gas < 0.01 ? gas.toFixed(4) : gas.toFixed(3)}</b> ${T("in USDC, one transaction")}</span>` : ""}</div>`
      : empty("arcia", "Nothing mined yet in any mine. Start digging!"));
  }
  function tabHow() {
    const g = G();
    const bars = g.layerParts.map((p, i) => `<div class="bm-hbar" style="--h:${(p / 32) * 100}%;--c:${LAYER_COL[i][0]}"><img src="${src(LAYER_ICON[i])}" alt="" width="30" height="30" loading="lazy"><i></i><span>${T(g.layers[i])}</span><em>${((p / 63) * 100).toFixed(1)}%</em></div>`).join("");
    const odds = (g.ores || []).map((o) => `<li><img src="${src("ore-" + o.kind)}" alt="" width="34" height="34" loading="lazy"><div><b>${T(o.name)}</b><span>1 ${T("in")} ${fmtN(2 ** o.extra)} ${T("shares")}</span></div><em>+${fmtN(o.pts)}</em></li>`).join("");
    const ranks = (g.ranks || []).map((r) => `<li><img src="${src("badge-" + r.id)}" alt="" width="40" height="40" loading="lazy"><div><b>${T(r.name)}</b><span>${fmtN(r.min)}+ ${T("pts")}</span></div><em>${r.pct ? "+" + r.pct + "%" : "—"}</em></li>`).join("");
    return `<div class="bm-how">
      <div><h3>${T("Six layers, each half as rich")}</h3><img class="bm-how-art" src="${src("strata")}" alt="" width="820" height="740" loading="lazy"><div class="bm-hbars">${bars}</div><p class="bm-note">${T("A mine runs 3–60 days in six equal layers. The first layer releases half of everything, so the earliest builders dig the richest ground. A top-up is released over what's left of the curve.")}</p></div>
      <div><h3>${T("Rare ores & the jackpot")}</h3><img class="bm-how-art" src="${src("jackpot")}" alt="" width="900" height="498" loading="lazy"><ul class="bm-odds">${odds}</ul><p class="bm-note">${T("Only the best ore in a share counts. The Lucky gem makes every ore twice as likely.")}</p></div>
      <div><h3>${T("Ranks & badges")}</h3><ul class="bm-odds bm-ranks">${ranks}</ul><p class="bm-note">${T("Lifetime points across every mine, plus quest XP. Each rank adds a bonus and unlocks characters and pets.")}</p></div>
      <div><h3>${T("Your weight each hour")}</h3>
        <p class="bm-formula"><b>${T("points")}</b> × <b>${T("pickaxe")}</b> × (1 + <b>${T("bonuses")}</b>)</p>
        <ul class="bm-rules">
          <li>${T("Points: every share counts 1, up to")} ${fmtN(g.cap)} ${T("an hour. Rare ores add more (above).")}</li>
          <li>${T("Pickaxes ×1.15 to ×2.7. Bonuses add up to +100% at most:")}</li>
          <li class="sub">${T("$ARCIRCLE held: 100K +10%, 1M +20%, 5M +30%")}</li>
          <li class="sub">${T("Each extra X post on a new day +5% (up to +25%)")}</li>
          <li class="sub">${T("Each referral who posted +5% (up to +25%); joining through a link +5%")}</li>
          <li class="sub">${T("Daily streak (30+ shares a day) +2% a day, up to +20%")}</li>
          <li class="sub">${T("Rank +2% to +10%; Lantern +15%, Dynamite +50%")}</li>
        </ul>
        <p class="bm-note">${T("Each hour's release is split by weight. Your browser does the hashing only while you press Start and the tab is open, and hands in its shares every 30 seconds.")}</p></div>
      <div><h3>${T("Fair by design")}</h3><ul class="bm-rules">
        <li>${T("Opening a mine and joining one each cost 1 USDC worth of $ARCIRCLE — burned, never paid to anyone.")}</li>
        <li>${T("One X account per wallet, an hourly cap per wallet.")}</li>
        <li>${T("The mine's tokens sit in the contract. Nobody — not the creator, not ARCIRCLE PAD — can take them back. Anyone can top a mine up.")}</li>
        <li>${T("Unmined tokens and unproven shares are burned when the mine ends. Items are paid in $ARCIRCLE and burned.")}</li>
        <li>${T("Every root is capped on-chain by the halving schedule.")}</li>
      </ul></div></div>`;
  }

  // =====================================================================================
  // v3: the mine's numbers (dashboard), buying $ARCIRCLE, the hour's result, the forge, finds from others
  // =====================================================================================
  // the halving curve (api/_mine.mjs curve(), in floats — for the top-up estimate only)
  function curveF(start, end, t) {
    if (t <= start) return 0; if (t >= end) return 1;
    const L = (end - start) / 6, e = t - start, k = Math.floor(e / L);
    if (k >= 6) return 1;
    return ((64 - 2 ** (6 - k)) * L + 2 ** (5 - k) * (e - k * L)) / (63 * L);
  }
  // bars as divs: one per settled hour; hovering (or focusing) a bar reads its value out
  function barChart(rows, key, label, col) {
    const max = Math.max(1, ...rows.map((r) => r[key]));
    return `<div class="bm-chart" data-label="${esc(label)}"><div class="bm-chart-h"><b>${T(label)}</b><span class="bm-chart-read" aria-live="polite">${rows.length ? `${T("hour")} ${rows[rows.length - 1].e + 1}: <b data-no-i18n>${fmtN(rows[rows.length - 1][key])}</b>` : ""}</span></div>
      <div class="bm-bars" style="--c:${col}">${rows.map((r) => `<i tabindex="0" style="height:${Math.max(2, (r[key] / max) * 100).toFixed(1)}%" data-read="${T("hour")} ${r.e + 1}: ${fmtN(r[key])}" aria-label="${T("hour")} ${r.e + 1}: ${fmtN(r[key])}"></i>`).join("")}</div>
      <div class="bm-chart-x"><span>${rows.length ? `${T("hour")} ${rows[0].e + 1}` : ""}</span><span>${T("now")}</span></div></div>`;
  }
  async function creatorData() {
    if (S.dash && S.dash.id === S.id && Date.now() - S.dash.at < 60000) return S.dash.d;
    const d = await api(`creator=${S.id}`).catch(() => null);
    if (!d || d.error) return null;
    S.dash = { id: S.id, at: Date.now(), d };
    return d;
  }
  const histRows = (d, n) => (d.hist || []).slice(-n).map(([e, b, p, pot]) => ({ e, b, p, pot }));
  async function drawDash() {
    const el = $("bm-dashmini");
    if (!el || !S.live) { if (el) el.innerHTML = `<h3>${T("This mine, hour by hour")}</h3>` + empty("slime", "Hourly numbers appear once the mine is live."); return; }
    const d = await creatorData(), box = $("bm-dashmini");
    if (!box) return;
    if (!d) { box.innerHTML = `<h3>${T("This mine, hour by hour")}</h3>` + empty("slime", "No numbers yet."); return; }
    const rows = histRows(d, 48);
    box.innerHTML = `<div class="bm-dash-h"><h3>${T("This mine, hour by hour")}</h3><button type="button" class="bm-mini" data-act="dash">${T("Open the dashboard")}</button></div>` +
      (rows.length ? barChart(rows, "b", "Builders digging", "#ffc861") : empty("slime", "The first hour hasn't settled yet."));
  }
  async function dashModal() {
    const v = S.view; if (!v) return;
    const box = dialog(`<h2>${T("Mine dashboard")}</h2><div id="bm-dash"><p class="bm-sm">${T("Loading…")}</p></div>`);
    box.querySelector(".bm-modal").classList.add("wide");
    const d = await creatorData(), el = box.querySelector("#bm-dash");
    if (!d) { el.innerHTML = empty("slime", S.live ? "Couldn't load this mine's numbers — try again in a minute." : "The dashboard works once the mine is live."); return; }
    const dec = d.token ? d.token.decimals : 18, sym = d.token ? d.token.symbol : "", rows = histRows(d, 72), c = d.counts || {};
    const t = now(), f0 = curveF(d.start, d.end, t), f1 = curveF(d.start, d.end, Math.min(d.end, t + 3600));
    const perHour = (raw) => (f0 < 1 ? (units(raw, dec) * (f1 - f0)) / (1 - f0) : 0);
    const embed = `<iframe src="${location.origin}/embed/mine/${d.id}" width="420" height="330" style="border:0;border-radius:18px;max-width:100%" loading="lazy" title="Builder Mine $${sym}"></iframe>`;
    const promo = `${location.origin}/mine/${d.id}?c=open`;
    const intent = `https://x.com/intent/post?text=${encodeURIComponent(`$${sym} is in the ground on Arc. Builders, come dig: Builder Mine on ARCIRCLE PAD ♾`)}&url=${encodeURIComponent(promo)}`;
    el.innerHTML = `<div class="bm-kpis k4">
        <div><span>${T("In the mine")}</span><b data-no-i18n>${compact(units(d.deposited, dec))}</b></div>
        <div><span>${T("Released so far")}</span><b data-no-i18n>${compact(units(d.emittedNow, dec))}</b></div>
        <div><span>${T("Builders joined")}</span><b data-no-i18n>${fmtN(d.builders)}</b></div>
        <div><span>${T("Released next hour")}</span><b data-no-i18n>${compact(perHour(BigInt(d.deposited) - BigInt(d.emittedNow)))}</b></div>
        <div><span>${T("Posts on X")}</span><b data-no-i18n>${fmtN(c.posts)}</b></div>
        <div><span>${T("Builders who posted")}</span><b data-no-i18n>${fmtN(c.xbuilders)}</b></div>
        <div><span>${T("Joined by referral")}</span><b data-no-i18n>${fmtN(c.refs)}</b></div>
        <div><span>${T("Top-ups")}</span><b data-no-i18n>${fmtN((d.topups || []).length)}/16</b></div></div>
      ${rows.length ? barChart(rows, "b", "Builders digging", "#ffc861") + barChart(rows, "p", "Points handed in", "#7ff6ff") : empty("slime", "The first hour hasn't settled yet.")}
      ${t < d.end - 3600 ? `<div class="bm-dashsec"><h3>${T("What a top-up would do")}</h3><div class="bm-row"><input id="bm-d-top" inputmode="decimal" placeholder="${esc(compact(units(d.minTopUp, dec)))}" aria-label="${T("Top-up amount")}"><span class="bm-sm" id="bm-d-topr">${T("At least")} <b data-no-i18n>${compact(units(d.minTopUp, dec))} $${esc(sym)}</b> (1% ${T("of the first deposit")})</span></div><button type="button" class="bm-mini" data-act="topup">${T("Top up")}</button></div>` : ""}
      <div class="bm-dashsec"><h3>${T("Promote it")}</h3><div class="bm-proof"><div class="bm-card-prev"><img src="/api/og?mine=${d.id}&c=open&t=${Math.floor(Date.now() / 60000)}" alt="${T("Your mine's card")}" loading="lazy" width="600" height="315"></div>
        <div><p class="bm-note">${T("Post the mine's card. Builders who join through a builder's link add to that builder's bonus — the more people share, the busier your mine.")}</p><div class="bm-row"><a class="bm-mini hot" href="${esc(intent)}" target="_blank" rel="noopener">${T("Post on X")}</a><button type="button" class="bm-mini" data-act="copy" data-copy="${esc(promo)}">${T("Copy link")}</button></div></div></div></div>
      <div class="bm-dashsec"><h3>${T("Put it on your site")}</h3><p class="bm-note">${T("A small live card: layer, builders digging, time left, and a Join button.")}</p><textarea class="bm-code" readonly rows="3" aria-label="${T("Embed code")}">${esc(embed)}</textarea><div class="bm-row"><button type="button" class="bm-mini" data-act="copy" data-copy="${esc(embed)}">${T("Copy code")}</button><a class="bm-mini" href="/embed/mine/${d.id}" target="_blank" rel="noopener">${T("Preview")}</a><a class="bm-mini" href="/embed/mine/${d.id}?theme=light" target="_blank" rel="noopener">${T("Light version")}</a></div></div>`;
    const inp = el.querySelector("#bm-d-top");
    if (inp) inp.addEventListener("input", () => { const a = Number(inp.value || 0), r = el.querySelector("#bm-d-topr"); if (r && a > 0) r.innerHTML = `${T("Adds about")} <b data-no-i18n>${compact(perHour(ethers.parseUnits(String(a), dec)))} $${esc(sym)}</b> ${T("to the next hour, and the rest over the remaining layers.")}`; });
    wireCharts(el);
  }
  function wireCharts(root) {
    root.querySelectorAll(".bm-chart").forEach((ch) => {
      const read = ch.querySelector(".bm-chart-read");
      const show = (e) => { const b = e.target.closest("[data-read]"); if (b && read) read.textContent = b.dataset.read; };
      ch.addEventListener("mouseover", show); ch.addEventListener("focusin", show);
    });
  }
  // not enough $ARCIRCLE: how much is missing, what it costs, a link to buy — then it carries on by itself
  function needArc(required, have, what) {
    const missing = required > have ? required - have : 0n;
    return new Promise((resolve) => {
      const feeArc = S.cfg && S.cfg.feeArc ? units(S.cfg.feeArc, 18) : 0, usd = feeArc ? (units(missing, 18) / feeArc) * ((S.cfg && S.cfg.feeUsd) || 1) : null;
      const amt = Math.ceil(units(missing, 18) * 1.02);
      let done = false, timer = 0;
      const box = dialog(`<h2>${T("A little more $ARCIRCLE")}</h2>
        <div class="bm-need"><img src="${src("coin-arc")}" alt="" width="56" height="56"><div><b data-no-i18n>${fmtN(amt)} $ARCIRCLE</b><span>${usd != null ? `≈ $${usd < 0.1 ? usd.toFixed(3) : usd.toFixed(2)} ${T("in USDC")} · ` : ""}${T(what)}</span></div></div>
        <ol class="bm-needsteps"><li>${T("Copy the amount, buy it on Argus (a new tab opens).")}</li><li>${T("Come back here — this waits for your balance and carries on by itself.")}</li></ol>
        <div class="bm-row"><button type="button" class="bm-mini" data-act="copy" data-copy="${amt}">${T("Copy amount")}</button><a class="bm-go small" href="${esc(BUY_ARC)}" target="_blank" rel="noopener">${T("Buy $ARCIRCLE")}</a></div>
        <p class="bm-sm" id="bm-need-st"><span class="bm-spin" aria-hidden="true"></span> ${T("Waiting for your $ARCIRCLE…")}</p>`);
      const finish = (ok) => { if (done) return; done = true; clearInterval(timer); box.remove(); resolve(ok); };
      box.addEventListener("click", (e) => { if (e.target === box || e.target.closest("[data-close]")) finish(false); });
      timer = setInterval(async () => {
        if (!document.body.contains(box)) { finish(false); return; }
        try {
          const b = await new ethers.Contract(ARCIRCLE, ERC20, state.signer).balanceOf(state.account);
          if (b >= required) { const st = box.querySelector("#bm-need-st"); if (st) st.textContent = tr("Got it — carrying on."); setTimeout(() => finish(true), 700); }
        } catch (e) { /* keep waiting */ }
      }, 5000);
    });
  }
  // the hour's result: points, place, what it paid — once per settled hour
  function hourResult() {
    const me = S.me, v = S.view, lh = me && me.lastHour;
    if (!lh || !v || lh.pts <= 0) return;
    const k = `bm.lh.${S.id}.${me0()}`, seen = Number(lsGet(k) || -1);
    if (lh.e <= seen) return;
    lsSet(k, String(lh.e));
    if (seen < 0 && lh.e > 0 && Date.now() - (S.bootAt || 0) > 5000) { /* first sight of an old hour after a long break: still show it */ }
    const el = $("bm-result"); if (!el) return;
    const dec = v.token ? v.token.decimals : 18, sym = v.token ? v.token.symbol : "";
    const rushO = (G().ores || []).find((o) => o.kind === lh.rush);
    const frame = myLook().char === "apprentice" ? "anim-celebrate" : "char-" + myLook().char;
    el.hidden = false;
    el.innerHTML = `<div class="bm-result-in" role="dialog" aria-label="${T("Hour results")}"><img class="bm-result-char" src="${src(frame)}" alt="">
      <div><em>${T("Hour")} ${lh.e + 1} ${T("settled")}</em><b data-no-i18n>#${lh.place} <small>${T("of")} ${fmtN(lh.of)}</small></b>
      <span data-no-i18n>${fmtN(lh.pts)} ${T("pts")} · +${compact(units(lh.got, dec))} $${esc(sym)}</span>
      ${rushO ? `<span class="bm-sm"><img src="${src("ore-" + rushO.kind)}" alt="" width="14" height="14"> ${T("Rush was")} ${T(rushO.name)}</span>` : ""}${lh.heart ? `<span class="bm-sm heart"><img src="${src("ore-heart")}" alt="" width="14" height="14"> ${T("You found the Heart of Arc")}</span>` : ""}
      <div class="bm-row"><button type="button" class="bm-mini hot" data-act="sharecard" data-card="${lh.heart ? "jackpot" : ""}" data-k="${lh.heart ? "heart" : ""}">${T("Share")}</button><button type="button" class="bm-mini" data-act="closeres">${T("Close")}</button></div></div></div>`;
    say(`${tr("Hour")} ${lh.e + 1}: #${lh.place} ${tr("of")} ${lh.of}, ${fmtN(lh.pts)} ${tr("pts")}`);
    Sound.level();
    clearTimeout(S.resT); S.resT = setTimeout(() => { const r = $("bm-result"); if (r) r.hidden = true; }, 12000);
  }
  // a new pickaxe: it spins out of the forge with its trail
  function forge(tier) {
    const el = $("bm-forge"), p = G().pickaxes[tier]; if (!el || !p) return;
    const col = TRAIL[tier] === "arc" ? "linear-gradient(90deg,#4d9fff,#35d8d0,#c38bff)" : TRAIL[tier] || "#ffd35c";
    el.hidden = false;
    el.innerHTML = `<div class="bm-forge-in"><i class="bm-forge-rays" aria-hidden="true"></i><img class="bm-forge-pick" src="${src("pick-" + p.id)}" alt=""><i class="bm-forge-trail" style="background:${col}"></i>
      <em>${T("New pickaxe")}</em><b>${T(p.name)}</b><span data-no-i18n>×${p.mult}</span></div>`;
    say(`${tr("New pickaxe")}: ${tr(p.name)}`);
    Sound.jackpot(); buzz([40, 30, 80]);
    setTimeout(() => { const f = $("bm-forge"); if (f) f.hidden = true; }, reduce ? 1500 : 3200);
  }
  // other builders' rare finds, as small toasts over the mine
  function feedToasts(v) {
    if (!v || !Array.isArray(v.feed)) return;
    const key = `${S.id}`, newest = v.feed.reduce((m, f) => Math.max(m, f.t || 0), 0);
    if (!S.feedSeen || S.feedSeen.k !== key) { S.feedSeen = { k: key, t: newest }; return; }
    const fresh = v.feed.filter((f) => f.t > S.feedSeen.t && f.w !== me0()).slice(0, 3);
    S.feedSeen.t = Math.max(S.feedSeen.t, newest);
    const box = $("bm-ftoasts"); if (!box) return;
    const found = { gold: "found gold", diamond: "found a diamond", arc: "found an Arc Crystal", heart: "reached the Heart of Arc" };
    fresh.forEach((f, i) => setTimeout(() => {
      const el = document.createElement("div"); el.className = `bm-ft k-${f.kind}`;
      el.innerHTML = `<img src="${src("ore-" + f.kind)}" alt="" width="26" height="26"><span data-no-i18n>${short(f.w)}</span> ${T(found[f.kind] || "found an ore")}`;
      box.appendChild(el); setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 500); }, 4200);
    }, i * 900));
  }
  const say = (m) => { const el = $("bm-sr"); if (el) { el.textContent = ""; setTimeout(() => { el.textContent = m; }, 60); } };

  // =====================================================================================
  // data
  // =====================================================================================
  async function loadCfg() {
    const j = await api("cfg=1").catch(() => ({}));
    S.cfg = j && !j.error ? j : null;
    if (S.cfg && S.cfg.game) S.G = { ...DEFAULT_GAME, ...S.cfg.game };
    S.live = !!(S.cfg && S.cfg.live);
    // deployed but the server side isn't switched on yet (operator key, secret, storage): stay in practice mode
    const rd = S.cfg && S.cfg.ready;
    S.setup = S.live && !!rd && !(rd.secret && rd.store && rd.operatorKey && rd.operatorMatches !== false);
    if (S.setup) S.live = false;
    S.address = S.cfg && S.cfg.address ? S.cfg.address : "";
    S.practice = !S.live;
  }
  async function loadList() {
    if (!S.live) { S.list = []; return; }
    const j = await api("list=1").catch(() => ({}));
    S.list = Array.isArray(j.mines) ? j.mines : [];
  }
  async function loadMine() {
    const w = me0();
    const rp = state.signer || (typeof readProvider === "function" ? readProvider() : null);
    const [v, me, bd, boards, stats, bal] = await Promise.all([
      S.id == null || S.id === "practice" ? null : api(`id=${S.id}`),
      S.id == null || S.id === "practice" || !w ? null : api(`id=${S.id}&w=${w}`),
      w && S.live ? api(`builder=${w}`) : null,
      S.live && (S.tab === "board" || !S.boards) ? api("boards=1") : null,
      S.live ? api("stats=1") : null,
      w && rp ? new ethers.Contract(ARCIRCLE, ERC20, rp).balanceOf(w) : null,
    ].map((p) => Promise.resolve(p).catch(() => null)));
    // a failed read keeps the last good one for the same mine and wallet (a blip shouldn't un-join you for 30 s)
    const key = `${S.id}:${w}`, blip = (x) => !x || (x.error && (x._status == null || x._status >= 500));
    S.view = v && !v.error ? v : blip(v) && S.viewKey === key ? S.view : null; S.viewAt = v && !v.error ? now() : S.viewAt || now();
    S.me = me && !me.error ? me : blip(me) && S.viewKey === key ? S.me : null;
    S.viewKey = key;
    S.bd = bd && !bd.error ? bd : S.bd;
    if (boards && !boards.error) S.boards = boards;
    if (stats && !stats.error) S.stats = stats;
    S.arcBal = bal != null ? bal : w ? S.arcBal : null;
    feedToasts(S.view);
    hourResult();
    // a new rank: celebrate, and offer the rank card
    const rk = myRank(), rkKey = `bm.rank.${w || "guest"}`, was = lsGet(rkKey);
    if (w && was != null && rk > Number(was)) { Scene.payday(`${tr("RANK UP")} · ${tr(G().ranks[rk].name).toUpperCase()}`); S.shareFind = { card: "rank", until: now() + 120 }; say(`${tr("Rank up")}: ${tr(G().ranks[rk].name)}`); }
    if (w) lsSet(rkKey, String(rk));
    // payday: what you've mined went up since the last look → the chest opens
    if (S.me && S.view) {
      const k = `${S.id}:${w}`, cur = BigInt(S.me.mined || 0);
      if (S.lastMined && S.lastMined.k === k && cur > S.lastMined.v) Scene.payday(`+${compact(units(cur - S.lastMined.v, S.view.token ? S.view.token.decimals : 18))} $${S.view.token ? S.view.token.symbol : ""}`);
      S.lastMined = { k, v: cur };
    }
  }
  async function refresh(all) {
    S.bootAt = S.bootAt || Date.now();
    try {
      if (all) { await loadCfg(); await loadList(); }
      if (S.id == null) S.id = S.practice ? "practice" : (S.list.find((m) => m.status === "live") || S.list[0] || { id: "practice" }).id;
      if (S.id === "practice" && !S.practice && S.list.length) S.id = S.list[0].id;
      if (S.id === "practice") S.practice = true;
      await loadMine();
    } catch (e) { /* keep what we had */ }
    paintAll();
  }
  function paintAll() { paintProf(); paintLive(); paintBanner(); paintMines(); paintMineHead(); paintSteps(); paintHud(); paintTabs(); }

  // =====================================================================================
  // mining
  // =====================================================================================
  function sessKey() { return `bm.s.${me0()}`; }
  async function ensureSession() {
    const w = me0();
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
      wk.onmessage = (e) => { const m = e.data || {}; if (m.type === "rate") S.rates[key] = m.hps; else if (m.type === "share") onShare(m.nonce, m.z); };
      wk.postMessage({ cmd: "start", ch, hi: (Math.random() * 2 ** 32) >>> 0, lo: (Math.random() * 2 ** 32) >>> 0, bits });
      S.workers.push(wk);
    }
    S.lastShareAt = Date.now();
    return true;
  }
  // the best ore a share is (the server's oreOf); the lucky gem makes each one bit easier
  function kindOf(z) {
    const luck = S.me && S.me.weight && S.me.weight.lucky ? 1 : 0, base = curBits();
    let best = "share";
    for (const o of G().ores || []) if (z >= base + o.extra - luck) best = o.kind;
    return best;
  }
  function onShare(nonce, z) {
    S.lastShareAt = Date.now();
    const kind = kindOf(z);
    Scene.share(kind);
    if (RARE.includes(kind)) say(`${tr("Found")} ${tr((G().ores.find((o) => o.kind === kind) || {}).name || kind)}`);
    if ((kind === "diamond" || kind === "arc") && typeof window.arcConfetti === "function" && !reduce) window.arcConfetti({ count: kind === "arc" ? 220 : 90 });
    if (kind === "arc") toast("ARC CRYSTAL! The jackpot ore — +500 points.");
    if (S.id === "practice") {
      S.local.shares++; if (kind !== "share") S.local.ores[kind] = (S.local.ores[kind] || 0) + 1;
      S.local.dug = Math.min(1, S.local.dug + 1 / 900);
      // the tutorial's first few shares come easier, so a first visit sees the pickaxe land
      if (S.tutorial > 0 && --S.tutorial === 0 && S.mining) { const ch = S.work && S.work.challenge; if (ch) startWorkers(ch, G().shareBits); toast("Tutorial over — this is the real pace now."); }
      if (S.local.shares >= G().cap) { S.capHit = true; stopMining(true); toast("Practice cap reached — in a live mine, Overtime raises it."); }
      return;
    }
    S.queue.push(nonce);
    const cap = S.me ? S.me.cap : G().cap;
    if (S.me && S.me.hour && S.me.hour.shares + S.queue.length >= cap) { S.capHit = true; flush().finally(() => stopMining(true)); toast("Hourly cap reached. Mining resumes next hour — or roll out an Overtime barrel."); }
  }
  async function flush() {
    if (!S.queue.length || !S.work || S.id === "practice") return;
    const nonces = S.queue.splice(0, G().maxBatch);
    const j = await post(`shares=${S.id}`, { w: me0(), s: S.sess && S.sess.token, nonces }).catch(() => ({ error: "offline" }));
    if (j.auth) { S.sess = null; lsSet(sessKey(), null); }
    if (j.error) { if (j._status === 429 || j.error === "offline") S.queue.unshift(...nonces); return; }
    if (S.me && S.me.hour) { S.me.hour.shares = j.shares; S.me.hour.ores = j.ores || S.me.hour.ores; S.me.cap = j.cap; if (j.points != null) S.me.hour.points = j.points; }
    // the server decides the Heart of Arc (one per mine per hour) — celebrate it when it says so
    const finds = j.finds || [];
    if (finds.some((f) => f.kind === "heart")) { Scene.share("heart"); toast("HEART OF ARC! You reached it first this hour — +100 points."); if (typeof window.arcConfetti === "function" && !reduce) window.arcConfetti({ count: 160 }); }
    const best = ["heart", "arc", "diamond"].find((k) => finds.some((f) => f.kind === k));
    if (best) { S.shareFind = { card: "jackpot", k: best, until: now() + 180 }; if (S.me && S.me.totals) S.me.totals.ores[best] = (S.me.totals.ores[best] || 0) + 1; }
    paintHud();
  }
  async function getWork() {
    const token = await ensureSession();
    const j = await api(`work=${S.id}&w=${me0()}&s=${encodeURIComponent(token)}`);
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
      S.work = { challenge: ch, bits: G().shareBits };
      if (!lsGet("bm.tut")) { S.tutorial = 5; lsSet("bm.tut", "1"); }
      if (!startWorkers(ch, curBits())) return;
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
      if (!S.work || S.id === "practice" || S.work.endsIn == null) return;
      const left = S.work.endsIn - (Date.now() - S.work.at) / 1000;
      if (left < 5 && !S.work.flushed) { S.work.flushed = true; await flush(); S.queue = []; }
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
  async function withTx(fn) {
    if (!mineAddr() || S.setup) { toast(S.setup ? "Builder Mine is being switched on — try again in a little while." : "The Builder Mine contract isn't live yet."); return false; }
    if (!state.account && typeof connectWallet === "function") await connectWallet();
    if (!state.account) return false;
    try {
      if (typeof ensureArcForWrite === "function") await ensureArcForWrite();
      if (!state.signer) throw new Error("Wallet isn't ready — reconnect and try again.");
      await fn(new ethers.Contract(mineAddr(), MINE_ABI, state.signer));
      await refresh(true);
      return true;
    } catch (e) {
      const m = e && (e.code === "ACTION_REJECTED" || e.code === 4001) ? "You cancelled in your wallet." : String((e && (e.shortMessage || e.reason || e.message)) || e).slice(0, 160);
      toast(m);
      return false;
    }
  }
  async function approveIf(token, amount) {
    const c = new ethers.Contract(token, ERC20, state.signer);
    const have = await c.allowance(state.account, mineAddr());
    if (have >= amount) return;
    toast("Approve in your wallet first.");
    await (await c.approve(mineAddr(), amount)).wait();
  }
  // opening and joining burn 1 USDC worth of $ARCIRCLE; the price can move a little between the quote and the block
  async function payFee(m) {
    const fee = await m.feeArc();
    if (fee === 0n) return;
    const want = (fee * 103n) / 100n;
    let bal = await new ethers.Contract(ARCIRCLE, ERC20, state.signer).balanceOf(state.account);
    if (bal < fee) {
      if (!(await needArc(want, bal, "The fee to join or open: 1 USDC worth, burned."))) throw new Error("Not enough $ARCIRCLE for the fee yet.");
      bal = await new ethers.Contract(ARCIRCLE, ERC20, state.signer).balanceOf(state.account);
    }
    await approveIf(ARCIRCLE, want > bal ? bal : want);
  }
  async function join() {
    await withTx(async (m) => {
      await payFee(m);
      const ref = lsGet(`bm.ref.${S.id}`) || "";
      const tx = await m.join(S.id, isAddr(ref) && ref.toLowerCase() !== me0() ? ref : ethers.ZeroAddress);
      toast("Joining…"); await tx.wait();
      toast("You're a builder in this mine. Press Start.");
      if (typeof window.arcConfetti === "function" && !reduce) window.arcConfetti({ count: 70 });
    });
  }
  async function buy(itemId) {
    const it = itemsList().find((i) => i.id === Number(itemId));
    if (!it) return;
    await withTx(async (m) => {
      let cost = BigInt(it.price);
      if (it.tier > 0 && S.me && S.me.pickaxe) { const cur = itemsList().find((i) => i.tier === S.me.pickaxe); if (cur) cost = cost > BigInt(cur.price) ? cost - BigInt(cur.price) : 0n; }
      const bal = await new ethers.Contract(ARCIRCLE, ERC20, state.signer).balanceOf(state.account);
      if (bal < cost && !(await needArc(cost, bal, it.tier > 0 ? "For the pickaxe — burned when you buy it." : "For the boost — burned when you buy it."))) throw new Error("Not enough $ARCIRCLE for that yet.");
      if (cost > 0n) await approveIf(ARCIRCLE, cost);
      const tx = await m.buyItem(it.id, it.tier > 0 ? 0 : S.id);
      toast("Burning $ARCIRCLE…"); await tx.wait();
      if (it.tier > 0) forge(it.tier);
      else { Scene.drop(BOOST_ART[it.boost] || "prop-lantern"); if (it.boost === 2) Scene.skill(); toast("Boost lit."); }
    });
  }
  async function claim() {
    const me = S.me;
    if (!me || !me.claimable || !me.claimable.proof) return;
    await withTx(async (m) => {
      const tx = await m.claim(S.id, state.account, me.claimable.cumulative, me.claimable.proof);
      toast("Claiming…"); await tx.wait();
      if (typeof window.arcConfetti === "function" && !reduce) window.arcConfetti({ count: 120 });
      toast("Claimed. Share your card on X!");
    });
  }
  async function claimAll() {
    const w = me0();
    if (!w) { if (typeof connectWallet === "function") await connectWallet(); return; }
    const views = await Promise.all(S.list.slice(0, 12).map((m) => api(`id=${m.id}&w=${w}`).then((j) => ({ id: m.id, j })).catch(() => null)));
    const rows = views.filter((x) => x && x.j && x.j.claimable && x.j.claimable.proof && BigInt(x.j.claimable.cumulative) > BigInt(x.j.claimable.claimed));
    if (!rows.length) { toast("Nothing to claim in any mine yet."); return; }
    await withTx(async (m) => {
      const tx = await m.claimMany(rows.map((r) => r.id), state.account, rows.map((r) => r.j.claimable.cumulative), rows.map((r) => r.j.claimable.proof));
      toast(`Claiming from ${rows.length} mines…`); await tx.wait();
      if (typeof window.arcConfetti === "function" && !reduce) window.arcConfetti({ count: 160 });
    });
  }
  async function burnCall(which) {
    await withTx(async (m) => { const tx = which === 1 ? await m.burnUnmined(S.id) : await m.burnUnclaimed(S.id); toast("Burning…"); await tx.wait(); toast("Burned."); });
  }
  async function verifyX(url) {
    const msg = $("bm-xmsg");
    if (msg) msg.textContent = tr("Checking your post…");
    try {
      const token = await ensureSession();
      const j = await post(`xpost=${S.id}`, { w: me0(), s: token, url });
      if (j.error) { if (msg) msg.textContent = tr(j.error); return; }
      toast(j.first ? "Post verified — claiming is unlocked." : `Post verified: +${j.bonusPct}%`);
      if (typeof window.arcConfetti === "function" && !reduce) window.arcConfetti({ count: 60 });
      await refresh();
    } catch (e) { if (msg) msg.textContent = String(e.message || e); }
  }
  async function claimQuests() {
    try {
      const token = await ensureSession();
      const j = await post("quests=1", { w: me0(), s: token });
      if (j.error) { toast(j.error); return; }
      toast(`+${j.xp} XP`); Scene.payday(`+${j.xp} XP`);
      await refresh();
    } catch (e) { toast(String(e.message || e)); }
  }
  async function crewDo(act, name) {
    try {
      const token = await ensureSession();
      const j = await post(`crew=${act}`, { w: me0(), s: token, name });
      if (j.error) { toast(j.error); return; }
      toast(act === "leave" ? "You left the crew." : `Welcome to ${j.crew.name}!`);
      S.boards = null; await refresh();
    } catch (e) { toast(String(e.message || e)); }
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
    await post("look=1", { w: me0(), s: S.sess.token, char: S.look.char, pet: S.look.pet }).catch(() => null);
  }

  // ---------------- dialogs: open a mine, top one up, edit its info ----------------
  function dialog(html, onSubmit) {
    const box = document.createElement("div");
    box.className = "bm-modal-back";
    box.innerHTML = `<div class="bm-modal" role="dialog" aria-modal="true"><button type="button" class="bm-x" data-close aria-label="${T("Close")}">×</button>${html}</div>`;
    document.body.appendChild(box);
    const close = () => box.remove();
    box.addEventListener("click", (e) => { if (e.target === box || e.target.closest("[data-close]")) close(); });
    const f = box.querySelector("form");
    if (f) f.addEventListener("submit", async (e) => { e.preventDefault(); if (await onSubmit(box)) close(); });
    const first = box.querySelector("input"); if (first) first.focus();
    return box;
  }
  const feeLine = () => { const fa = S.cfg && S.cfg.feeArc; return fa ? `≈ ${compact(units(fa, 18))} $ARCIRCLE (1 USDC)` : "1 USDC worth of $ARCIRCLE"; };
  function openModal() {
    if (!S.live) toast("Opening mines starts when the contract is live on Arc.");
    const box = dialog(`<h2>${T("Open a mine")}</h2>
      <p class="bm-note">${T("Put part of your token's supply in the ground. Builders dig it over the days you pick; what nobody digs is burned. You can't take it back.")}</p>
      <form autocomplete="off">
        <label>${T("Token")}<input id="bm-o-tok" placeholder="0x…" spellcheck="false" required></label>
        <span class="bm-sm" id="bm-o-info"></span>
        <label>${T("Amount")}<input id="bm-o-amt" inputmode="decimal" placeholder="0" required></label>
        <div class="bm-row" id="bm-o-pct">${[5, 10, 20].map((p) => `<button type="button" class="bm-mini" data-pct="${p}">${p}%</button>`).join("")}<span class="bm-sm">${T("of your balance")}</span></div>
        <div class="bm-row2"><label>${T("Runs for")}<select id="bm-o-days">${[3, 7, 14, 30, 60].map((d) => `<option value="${d}" ${d === 14 ? "selected" : ""}>${d} ${T("days")}</option>`).join("")}</select></label>
        <label>${T("Opens")}<select id="bm-o-delay"><option value="0">${T("Now")}</option><option value="3600">${T("In 1 hour")}</option><option value="86400">${T("In 24 hours")}</option></select></label></div>
        <label>${T("Mine name")}<input id="bm-o-name" maxlength="32" placeholder="${T("e.g. The Builder Coin mine")}"></label>
        <label>${T("One line about it")}<input id="bm-o-about" maxlength="160"></label>
        <label>${T("Link (X, Telegram or site)")}<input id="bm-o-link" maxlength="100" placeholder="https://"></label>
        <div class="bm-o-sum" id="bm-o-sum"></div>
        <p class="bm-sm">${T("Opening costs")} <b data-no-i18n>${feeLine()}</b>, ${T("burned.")}</p>
        <label class="bm-check"><input type="checkbox" id="bm-o-ok" required> <span>${T("I understand the deposit can't come back: it's mined by builders or burned.")}</span></label>
        <button type="submit" class="bm-go small">${T("Open the mine")}</button>
      </form>`, async (bx) => {
      if (!meta) { toast("Pick a token first."); return false; }
      let raw; try { raw = ethers.parseUnits(String(amt.value || "0"), meta.decimals); } catch (er) { toast("That amount isn't a number."); return false; }
      if (raw <= 0n) { toast("Enter an amount."); return false; }
      const link = bx.querySelector("#bm-o-link").value.trim();
      if (link && !safeLink(link)) { toast("The link must start with https://"); return false; }
      const okd = await withTx(async (m) => {
        await payFee(m);
        await approveIf(tok.value.trim(), raw);
        const tx = await m.openMine(tok.value.trim(), raw, Number(bx.querySelector("#bm-o-days").value), Number(bx.querySelector("#bm-o-delay").value), bx.querySelector("#bm-o-name").value.trim().slice(0, 32), bx.querySelector("#bm-o-about").value.trim().slice(0, 160), link);
        toast("Opening the mine…"); await tx.wait();
        if (typeof window.arcConfetti === "function" && !reduce) window.arcConfetti({ count: 140 });
        toast("Your mine is open. Share it so builders find it.");
        S.id = null; S.promoNext = true;
      });
      if (okd && S.promoNext) { S.promoNext = false; const mine = S.list.filter((x) => x.creator === me0()).sort((a, b) => b.id - a.id)[0]; if (mine) { S.id = mine.id; setHash(); await refresh(); dashModal(); } }
      return okd;
    });
    box.addEventListener("click", (e) => { const p = e.target.closest("[data-pct]"); if (p) pct(Number(p.dataset.pct)); });
    const tok = box.querySelector("#bm-o-tok"), amt = box.querySelector("#bm-o-amt"), info = box.querySelector("#bm-o-info");
    let meta = null;
    const sum = () => {
      const a = Number(amt.value || 0), d = Number(box.querySelector("#bm-o-days").value);
      box.querySelector("#bm-o-sum").innerHTML = meta && a > 0 ? `<b>${T("Layer 1 releases")} ${compact((a * 32) / 63)} $${esc(meta.symbol)}</b> ${T("in the first")} ${dur((d * 86400) / 6)}, ${T("then half as much each layer.")}` : "";
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
  }
  function topUpModal() {
    const v = S.view; if (!v) return;
    const sym = v.token ? v.token.symbol : "", dec = v.token ? v.token.decimals : 18;
    dialog(`<h2>${T("Top up this mine")}</h2><p class="bm-note">${T("Anyone can add more to a running mine. It's released over what's left of the curve — none of it counts as already mined — and, like the deposit, it can never come back.")} ${T("At least 1% of the first deposit.")}</p>
      <form><label>${T("Amount")} ($${esc(sym)})<input id="bm-t-amt" inputmode="decimal" required></label><button type="submit" class="bm-go small">${T("Top up")}</button></form>`, async (bx) => {
      let raw; try { raw = ethers.parseUnits(String(bx.querySelector("#bm-t-amt").value || "0"), dec); } catch (e) { toast("That amount isn't a number."); return false; }
      if (raw <= 0n) { toast("Enter an amount."); return false; }
      const firstDep = BigInt(((v.segs || [])[0] || {}).amount || v.deposited), minUp = (firstDep * BigInt((G().minTopUpPct) || 1)) / 100n;
      if (raw < minUp) { toast(`${tr("A top-up is at least")} ${compact(units(minUp, dec))} $${sym} (1% ${tr("of the first deposit")}).`); return false; }
      return withTx(async (m) => { await approveIf(v.token.address, raw); const tx = await m.topUp(S.id, raw); toast("Topping up…"); await tx.wait(); Scene.payday(`+${compact(units(raw, dec))} $${sym}`); });
    });
  }
  function editModal() {
    const v = S.view; if (!v) return;
    const info = v.info || {};
    dialog(`<h2>${T("Edit the mine")}</h2><form>
      <label>${T("Mine name")}<input id="bm-e-name" maxlength="32" value="${esc(info.name || "")}"></label>
      <label>${T("One line about it")}<input id="bm-e-about" maxlength="160" value="${esc(info.about || "")}"></label>
      <label>${T("Link (X, Telegram or site)")}<input id="bm-e-link" maxlength="100" value="${esc(info.link || "")}" placeholder="https://"></label>
      <button type="submit" class="bm-go small">${T("Save on-chain")}</button></form>`, async (bx) => {
      const link = bx.querySelector("#bm-e-link").value.trim();
      if (link && !safeLink(link)) { toast("The link must start with https://"); return false; }
      return withTx(async (m) => { const tx = await m.setInfo(S.id, bx.querySelector("#bm-e-name").value.trim(), bx.querySelector("#bm-e-about").value.trim(), link); toast("Saving…"); await tx.wait(); });
    });
  }
  async function pauseMine() { const v = S.view; if (!v) return; await withTx(async (m) => { const tx = await m.setMinePaused(S.id, !v.paused); await tx.wait(); toast(v.paused ? "Joins are open again." : "New joins are paused."); }); }

  // =====================================================================================
  // events
  // =====================================================================================
  function onClick(e) {
    const mc = e.target.closest("[data-mine]");
    if (mc) { const id = mc.dataset.mine; if (S.mining) stopMining(); S.id = id === "practice" ? "practice" : Number(id); S.local = { shares: 0, ores: {}, dug: S.local.dug }; S.lastLayer = -1; setHash(); Scene.set({ jump: true }); refresh(); return; }
    const fl = e.target.closest("[data-bmfilter]");
    if (fl) { S.filter = fl.dataset.bmfilter; paintMines(); return; }
    const wv = e.target.closest("[data-bmview]");
    if (wv) { S.worldView = wv.dataset.bmview; lsSet("bm.wview", S.worldView); paintMines(); return; }
    const tb = e.target.closest("#bm-tabs [data-tab]");
    if (tb) { S.tab = tb.dataset.tab; S.moreOpen = false; paintTabs(); if (S.tab === "board" && S.live) api("boards=1").then((b) => { if (b && !b.error) { S.boards = b; paintTabs(); } }); return; }
    const bt = e.target.closest("[data-board]");
    if (bt) { S.boardTab = bt.dataset.board; paintTabs(); return; }
    const pw = e.target.closest("[data-power]");
    if (pw) { S.power = Number(pw.dataset.power); paintPower(); if (S.mining) { stopMining(); startMining(); } return; }
    const lk = e.target.closest("[data-look]");
    if (lk) { pickLook(lk.dataset.look, lk.dataset.id); return; }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    const act = a.dataset.act;
    if (act === "open") openModal();
    else if (act === "dash") dashModal();
    else if (act === "hud") { S.hudOpen = !S.hudOpen; paintHud(); }
    else if (act === "more") { S.moreOpen = !S.moreOpen; paintTabs(); }
    else if (act === "pickcard") { S.cardPick = { card: a.dataset.card, k: a.dataset.k }; paintTabs(); }
    else if (act === "sharecard") { S.cardPick = { card: a.dataset.card || "", k: a.dataset.k || "" }; S.shareFind = null; const r = $("bm-result"); if (r) r.hidden = true; S.tab = "mine"; paintTabs(); paintHud(); $("bm-tabs").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }
    else if (act === "closeres") { const r = $("bm-result"); if (r) r.hidden = true; }
    else if (act === "install") { const ev = S.installEvt; if (ev) { ev.prompt(); ev.userChoice.finally(() => { S.installEvt = null; a.hidden = true; }); } }
    else if (act === "connect") { if (typeof connectWallet === "function") connectWallet().then(() => refresh()); }
    else if (act === "join") join();
    else if (act === "buy") buy(a.dataset.item);
    else if (act === "claim") claim();
    else if (act === "claimall") claimAll();
    else if (act === "burn1") burnCall(1);
    else if (act === "burn2") burnCall(2);
    else if (act === "topup") topUpModal();
    else if (act === "editinfo") editModal();
    else if (act === "pausemine") pauseMine();
    else if (act === "quests") claimQuests();
    else if (act === "crewleave") crewDo("leave");
    else if (act === "stop") stopMining();
    else if (act === "totop") $("bm-stage").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    else if (act === "tab") { S.tab = a.dataset.tab; paintTabs(); $("bm-tabs").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); }
    else if (act === "copy") { navigator.clipboard && navigator.clipboard.writeText(a.dataset.copy).then(() => toast("Link copied.")); }
    else if (act === "sound") { S.sound = !S.sound; lsSet("bm.sound", S.sound ? "1" : "0"); a.innerHTML = S.sound ? svgI.sound : svgI.mute; a.setAttribute("aria-pressed", String(S.sound)); if (S.sound) Sound.ore("gold"); }
    else if (act === "full") { const st = $("bm-stage"); if (document.fullscreenElement) document.exitFullscreen(); else if (st.requestFullscreen) st.requestFullscreen().then(() => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape").catch(() => {}); } catch (er) { /* not a phone */ } }).catch(() => toast("Full screen isn't available here.")); }
    else if (act === "enter") { lsSet("bm.intro", "1"); $("bm-intro").classList.add("out"); setTimeout(() => { $("bm-intro").hidden = true; }, 600); Scene.set({ descend: true }); setTimeout(() => tour(0), 1400); }
    else if (act === "skip") { lsSet("bm.intro", "1"); $("bm-intro").hidden = true; }
    else if (act === "tour") tour(Number(a.dataset.i));
  }
  function onChange(e) {
    if (e.target.id === "bm-sort") { S.sort = e.target.value; paintMines(); }
    if (e.target.dataset && e.target.dataset.act === "xshare") setXshare(e.target.checked, e.target);
  }
  async function setXshare(on, el) {
    try {
      const token = await ensureSession();
      const j = await post("prefs=1", { w: me0(), s: token, xshare: on });
      if (j.error) throw new Error(j.error);
      toast(on ? "ARCIA will post your Arc Crystal on X." : "ARCIA won't post your finds.");
      if (S.bd) S.bd.prefs = j.prefs; if (S.me) S.me.prefs = j.prefs;
    } catch (er) { if (el) el.checked = !on; toast(String(er.message || er)); }
  }
  function onSubmit(e) {
    if (e.target.id === "bm-xform") { e.preventDefault(); const u = $("bm-xurl"); if (u && u.value.trim()) verifyX(u.value.trim()); }
    if (e.target.id === "bm-crewf") { e.preventDefault(); const n = $("bm-crewn"), act = (e.submitter && e.submitter.dataset.crew) || "create"; if (n && n.value.trim()) crewDo(act, n.value.trim()); }
  }
  function setHash() {
    if (!history.replaceState || (!/^#mine/.test(location.hash) && location.hash)) return;
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
    if (document.hidden && S.mining) { S.pausedByHide = true; S.hiddenAt = Date.now(); stopMining(); }
    else if (!document.hidden && S.pausedByHide) {
      S.pausedByHide = false;
      const min = Math.round((Date.now() - (S.hiddenAt || Date.now())) / 60000);
      toast(min >= 1 ? `${tr("You were away")} ${min} ${tr(min === 1 ? "minute" : "minutes")} — ${tr("mining picked up again.")}` : "Mining picked up again.");
      startMining();
    }
  });
  // the site as an app: one tap to the mine from the home screen
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); S.installEvt = e; const b = panel.querySelector(".bm-inst"); if (b) b.hidden = false; });
  // on battery and running low: one core only
  function battery() {
    if (!navigator.getBattery) return;
    navigator.getBattery().then((b) => { const check = () => { if (!b.charging && b.level < 0.3 && S.power > 1) { S.power = 1; paintPower(); toast("On battery and below 30% — mining on one core."); if (S.mining) { stopMining(); startMining(); } } }; check(); b.addEventListener("levelchange", check); b.addEventListener("chargingchange", check); }).catch(() => {});
  }

  function show() {
    if (!S.booted) { S.booted = true; frame(); readHash(); refresh(true); battery(); }
    else { readHash(); refresh(); }
    Scene.size(); Scene.start();
    clearInterval(S.pollTimer);
    S.pollTimer = setInterval(() => { if (!document.hidden && panel.classList.contains("active")) refresh(); }, 30000);
  }
  function hide() { Scene.stop(); clearInterval(S.pollTimer); document.documentElement.classList.remove("bm-focus"); }
  window.addEventListener("resize", () => { if (S.booted) Scene.size(); });
  document.addEventListener("fullscreenchange", () => setTimeout(() => Scene.size(), 80));
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
    S.sess = null; S.bd = null; S.lastMined = null;
    if (panel.classList.contains("active")) refresh();
  }, 1500);
  if (panel.classList.contains("active")) show();
  window.arcMine = { scene: Scene, state: S, refresh, forge, hourResult };
})();
