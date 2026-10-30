// world-sfx.js — the game's sound effects, every one synthesized in the browser (WebAudio: oscillators, one shared
// noise buffer, short envelopes), so there is nothing to download. world-play.js makes it once as `Snd` and hands it to
// every module (ctx.Snd); the old names (pick, win, coin, chest, swing, impact, …) all still work.
//
// One AudioContext, made on the first tap or key the browser counts (world-play.js wake → unlock). Everything goes
// through one gain (Settings → Sound effects, 0…100, S.sfx; Sound off mutes it) and a soft clipper, so a pile-up
// never clips. At most MAXV sounds play at once (a new one past that is dropped), nothing plays while the tab is hidden (the
// context is suspended then), and a sound asked for again within a few ms is skipped (a chain of shocks, a fan of
// arrows).
//
// What it adds on top of the old set:
//   UI          open / close (any modal dialog appearing or going, seen by a MutationObserver), tab (a [role=tab] or a
//               segmented button), tap (a button in a panel: only when nothing else answered the click), equip, buy,
//               salvage (a crunch), bad (an error buzz)
//   progress    quest (a jingle), level (a fanfare), drop(r) (a shimmer, brighter and longer with the rarity)
//   combat      swing(heavy, weapon kind), hitFx(kind, crit) (a crit's ding, fire's crackle, ice's chime, a shock's
//               zap, a heavy blow's thud), kill(rank) (a pop, bigger for an elite or a boss)
//   moving      land(impact) soft or heavy, step(speed): footsteps only while running, and only with Settings →
//               Footsteps on (S.steps; off by default on phones)
// Haptics stay in world-play.js (buzz, Settings → Vibration).
//
// render(name, args, secs): plays one sound into an OfflineAudioContext and returns its peak and loudness (for tests).
export const MAXV = 12;
export const RUN = 9; // world-play.js's speed while running is 12.5, walking 6.5
const SHIMMER = [1047, 1319, 1568, 2093, 2637, 3136]; // a drop's base note by rarity: the rarer, the brighter
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/// the default for footsteps: on with a mouse, off on a phone (S.steps overrides)
export const stepsDefault = (coarse) => !coarse;
/// should a footstep play at this speed: only while running, and only when footsteps are on
export const stepOk = (sp, on) => !!on && sp >= RUN;

export function createSfx({ S, saveSet = () => {}, music = () => null, coarse = false } = {}) {
  let ac = null, out = null, nbuf = null, V = { n: 0 }, lastAt = 0, quiet = false, stepAlt = false;
  const gaps = {}, hush = {};
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const vol = () => (S.sound ? 0.6 * Math.max(0, Math.min(100, S.sfx ?? 70)) / 100 : 0);
  const stepsOn = () => S.steps ?? stepsDefault(coarse);
  const hidden = () => typeof document !== "undefined" && document.hidden;
  // the end of the chain: the volume, then a soft clipper that leaves quiet sounds alone and never lets a pile-up past
  // 0.98 (a DynamicsCompressor was tried: its automatic make-up gain made quiet sounds several times louder)
  function chain(c) {
    const g = c.createGain(); g.gain.value = vol();
    const pre = c.createGain(); pre.gain.value = 1 / 3; const sh = c.createWaveShaper(), curve = new Float32Array(1025);
    for (let i = 0; i < curve.length; i++) curve[i] = 0.98 * Math.tanh(3 * (i / 512 - 1)); sh.curve = curve; sh.oversample = "2x";
    g.connect(pre); pre.connect(sh); sh.connect(c.destination); return g;
  }
  function noiseBuf(c) { const b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  function init() {
    if (ac || !S.sound) return;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    out = chain(ac); // b448: the 2-second noise buffer is made a moment later, not inside the first tap or key (it was part of the first step's stall)
    setTimeout(() => { if (ac && !nbuf) nbuf = noiseBuf(ac); }, 400);
    // a low, soft drone under everything (the town's air)
    const amb = ac.createGain(); amb.gain.value = 0.035; const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; amb.connect(lp); lp.connect(out);
    [110, 164.8, 220.4].forEach((f, i) => { const o = ac.createOscillator(); o.type = i === 2 ? "triangle" : "sine"; o.frequency.value = f; o.detune.value = i * 4; o.connect(amb); o.start(); });
    document.addEventListener("visibilitychange", () => { if (!ac) return; if (document.hidden) ac.suspend().catch(() => {}); else if (S.sound) ac.resume().catch(() => {}); });
  }
  const can = () => !!ac && !!S.sound && !hidden() && V.n < MAXV;
  const gap = (k, ms) => { const t = now(); if (t - (gaps[k] || -1e9) < ms) return false; gaps[k] = t; return true; };
  // the music dips under a fanfare (world-music.js duck)
  const duck = (d, secs) => { if (!ac || !S.sound || hidden()) return; try { const m = music(); m && m.duck && m.duck(d, secs); } catch { /* no music */ } };
  function voice(src) { const v = V; v.n++; src.onended = () => { v.n--; }; if (!quiet) lastAt = now(); }
  // one note: an attack, an exponential fall, an optional glide (to) and low-pass (lp)
  function tone(f, dur, { type = "sine", v = 0.18, to = 0, at = 0, a = 0.012, lp = 0 } = {}) {
    if (!can()) return;
    const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = 0.0001; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (lp) { const fl = ac.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.value = lp; o.connect(fl); fl.connect(g); } else o.connect(g);
    g.connect(out); o.start(t); o.stop(t + dur + 0.02); voice(o);
  }
  // a burst of filtered noise fading out (type: bandpass / lowpass / highpass; to: the filter sweeps there)
  function noise(dur, v = 0.12, f = 900, { at = 0, type = "bandpass", q = 1, to = 0, a = 0 } = {}) {
    if (!can()) return;
    if (!nbuf) return; const t = ac.currentTime + at, n = ac.createBufferSource(); n.buffer = nbuf; n.loop = dur > 1.8;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.frequency.setValueAtTime(f, t); fl.Q.value = q; if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ac.createGain(); g.gain.value = 0; // (the values before the start too: a delayed sound must not jump from the defaults)
    if (a) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); } else g.gain.setValueAtTime(v, t);
    g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(fl); fl.connect(g); g.connect(out); n.start(t, n.loop ? 0 : Math.random() * Math.max(0, 1.9 - dur)); n.stop(t + dur + 0.02); voice(n);
  }
  // a scene: the raid's beat, or a hunting ground's ambience, quietly under everything else
  let sceneK = "", sceneIv = 0, beat = 0;
  const RAID_SEQ = [110, 0, 131, 0, 147, 0, 131, 0, 98, 0, 117, 0, 131, 0, 117, 0];
  function scene(k) {
    if (k === sceneK) return; sceneK = k; clearInterval(sceneIv); sceneIv = 0; beat = 0;
    if (!k) return;
    sceneIv = setInterval(() => {
      if (!ac || !S.sound || document.hidden) return; const b = beat++; quiet = true;
      if (k === "raid") { const s = b % 16; if (s % 4 === 0) { tone(58, 0.24, { to: 40, v: 0.13 }); noise(0.04, 0.05, 140); } if (s % 8 === 4) noise(0.11, 0.06, 1900); if (RAID_SEQ[s]) tone(RAID_SEQ[s], 0.2, { type: "sawtooth", v: 0.022 }); }
      else if (k === "spam") { if (Math.random() < 0.2) tone(1100 + Math.random() * 1300, 0.05, { type: "square", v: 0.012 }); }
      else if (k === "fields") { if (b % 12 === 0) noise(2.6, 0.018, 420); if (Math.random() < 0.06) tone(1900 + Math.random() * 600, 0.12, { v: 0.012, to: 2500 }); }
      else if (k === "swamp") { if (Math.random() < 0.18) tone(170 + Math.random() * 120, 0.14, { to: 430, v: 0.025 }); }
      else if (k === "canyon") { if (b % 10 === 0) noise(2.4, 0.026, 230); }
      else if (k === "depths") { if (b % 8 === 0) tone(46, 1.9, { v: 0.045 }); if (Math.random() < 0.08) tone(660, 0.6, { type: "triangle", v: 0.01, to: 330 }); }
      // the far ring: wind on the peaks, a sand gust, the reef's bubbles, the farm's hum and clicks, a hollow echo in
      // the ruins, the abyss's rumble and crackle, a shimmer in the void
      else if (k === "peaks") { if (b % 6 === 0) noise(3.2, 0.03, 700 + Math.random() * 500); if (Math.random() < 0.05) tone(2400 + Math.random() * 800, 0.3, { v: 0.008, to: 3000 }); }
      else if (k === "dunes") { if (b % 7 === 0) noise(2.8, 0.035, 1500 + Math.random() * 900); }
      else if (k === "reef") { if (Math.random() < 0.3) tone(300 + Math.random() * 500, 0.09, { to: 700 + Math.random() * 600, v: 0.02 }); if (b % 9 === 0) noise(3, 0.02, 260); }
      else if (k === "wastes") { if (b % 2 === 0) tone(60, 0.5, { type: "sawtooth", v: 0.012 }); if (Math.random() < 0.25) tone(1800 + Math.random() * 1600, 0.03, { type: "square", v: 0.01 }); }
      else if (k === "ruins") { if (b % 10 === 0) { tone(196, 1.6, { type: "triangle", v: 0.014, to: 185 }); tone(233, 1.6, { type: "triangle", v: 0.01, to: 220, at: 0.4 }); } }
      else if (k === "abyss") { if (b % 4 === 0) tone(38, 1.6, { v: 0.05, to: 32 }); if (Math.random() < 0.35) noise(0.05, 0.03, 2600 + Math.random() * 2000); }
      // Jurassic World (b-jy2): the plain by day (insects, far calls, leaves), by night (crickets, frogs, an owl), the Ember
      // Basin (a low boil and pops), and the boss hour's war drums while you're near the enraged boss
      else if (k === "jungle") { if (b % 9 === 0) noise(2.8, 0.022, 650 + Math.random() * 300); if (Math.random() < 0.12) for (let i = 0; i < 4; i++) tone(4200 + Math.random() * 900, 0.03, { type: "square", v: 0.004, at: i * 0.05, lp: 6000 }); if (Math.random() < 0.03) tone(380 + Math.random() * 120, 0.5, { type: "triangle", v: 0.012, to: 260 }); }
      else if (k === "jnight") { if (b % 2 === 0) for (let i = 0; i < 3; i++) tone(4600, 0.025, { type: "square", v: 0.005, at: i * 0.06, lp: 7000 }); if (Math.random() < 0.08) tone(210 + Math.random() * 60, 0.16, { to: 150, v: 0.02 }); if (b % 22 === 0) { tone(420, 0.3, { type: "triangle", v: 0.014, to: 380 }); tone(400, 0.45, { type: "triangle", v: 0.012, to: 360, at: 0.4 }); } }
      else if (k === "basin") { if (b % 3 === 0) tone(42, 1.5, { v: 0.04, to: 36 }); if (Math.random() < 0.3) noise(0.05, 0.03, 900 + Math.random() * 900, { type: "lowpass" }); }
      else if (k === "jboss") { const s = b % 8; if (s === 0 || s === 3 || s === 5) { tone(64, 0.3, { to: 42, v: 0.14 }); noise(0.06, 0.06, 160, { type: "lowpass" }); } if (s === 6) noise(0.09, 0.05, 2400); if (s % 4 === 2) tone(s === 2 ? 98 : 110, 0.35, { type: "sawtooth", v: 0.018, lp: 900 }); }
      // the Halloween Realm (HX1): by day a breeze, creaking boughs and a music box now and then; the Cursed Night's wind
      // howls, an owl, chains and a far bell; Inferno Jack's throne a slow drum under fire's crackle
      else if (k === "hwday") { if (b % 8 === 0) noise(3, 0.02, 520 + Math.random() * 300); if (Math.random() < 0.05) tone(140 + Math.random() * 40, 0.5, { type: "triangle", v: 0.012, to: 120 }); if (b % 26 === 0) [659, 784, 988, 784].forEach((f, i) => tone(f, 0.4, { type: "triangle", v: 0.012, at: i * 0.32 })); }
      else if (k === "hwnight") { if (b % 6 === 0) noise(3.4, 0.035, 300 + Math.random() * 250, { to: 700, a: 0.8 }); if (Math.random() < 0.06) { tone(392, 0.35, { v: 0.022, to: 330 }); tone(330, 0.5, { v: 0.018, at: 0.42, to: 300 }); } if (Math.random() < 0.07) for (let i = 0; i < 3; i++) noise(0.04, 0.03, 3400, { at: i * 0.07 }); if (b % 30 === 0) tone(98, 3.5, { type: "triangle", v: 0.04, a: 0.01 }); }
      else if (k === "hwjack") { const s = b % 8; if (s === 0 || s === 4) { tone(55, 0.42, { to: 38, v: 0.14 }); noise(0.07, 0.06, 150, { type: "lowpass" }); } if (s === 6) tone(73, 0.3, { to: 50, v: 0.09 }); if (Math.random() < 0.6) noise(0.04, 0.03, 1400 + Math.random() * 2400); }
      else if (k === "void") { if (b % 6 === 0) [523, 784, 1175].forEach((f, i) => tone(f * (Math.random() < 0.5 ? 1 : 1.5), 1.2, { v: 0.008, at: i * 0.3 })); if (b % 12 === 0) tone(55, 3, { v: 0.03 }); }
      quiet = false;
    }, k === "raid" || k === "jboss" || k === "hwjack" ? 250 : 500);
  }
  // a drop's shimmer: more partials, higher and longer the rarer it is; an Epic sparkles, a Legendary swells under it
  function shimmer(r, k = 1) {
    r = Math.max(0, Math.min(SHIMMER.length - 1, r | 0)); const f = SHIMMER[r], d = (0.22 + r * 0.12) * k;
    [1, 1.25, 1.5, 2, 2.5, 3].slice(0, 2 + r).forEach((m, i) => tone(f * m, d, { v: 0.032, at: i * 0.045 * k, a: 0.006 }));
    if (r >= 3) noise(0.5 * k, 0.025, 7000, { type: "highpass", at: 0.08, a: 0.1 });
    if (r >= 4) tone(131, 1.1 * k, { type: "triangle", v: 0.06, a: 0.25 });
  }
  const api = {
    init, unlock: () => { init(); if (ac && ac.state !== "running" && !hidden()) ac.resume().catch(() => {}); }, ready: () => !S.sound || (!!ac && ac.state === "running"),
    scene, set(on) { S.sound = on; saveSet(); if (on) init(); api.volume(); try { music().refresh(); } catch { /* not set up yet */ } },
    /// the effects volume changed (S.sfx) or Sound went on or off
    volume() { if (out) out.gain.setTargetAtTime(vol(), ac.currentTime, 0.04); },
    state: () => ({ ctx: ac ? ac.state : "none", voices: V.n, sfx: S.sfx ?? 70, steps: stepsOn(), scene: sceneK }),
    // ---- moving ----
    step: (sp) => { if (!stepOk(sp, stepsOn()) || !gap("step", 120)) return; stepAlt = !stepAlt; noise(0.045, 0.1, stepAlt ? 700 : 850, { type: "lowpass", q: 0.7 }); tone(stepAlt ? 95 : 105, 0.06, { v: 0.03, to: 70 }); },
    jump: () => tone(300, 0.22, { type: "triangle", to: 620, v: 0.12 }),
    // impact: how fast you came down (a plain jump lands at about 9)
    land: (impact) => impact >= 12 ? (tone(82, 0.2, { to: 44, v: 0.14 }), noise(0.16, 0.12, 380, { type: "lowpass" })) : impact < 6 ? (noise(0.06, 0.2, 600, { type: "lowpass" }), tone(120, 0.06, { to: 80, v: 0.04 })) : (noise(0.09, 0.25, 520, { type: "lowpass" }), tone(110, 0.08, { to: 70, v: 0.06 })),
    // ---- UI ----
    tap: () => gap("tap", 50) && tone(1750, 0.04, { type: "triangle", v: 0.09, to: 1400, a: 0.002 }),
    // INFINITY RINGS: a ring clicks a step round, a clasp snaps open, a chain of falls climbs a scale (k = the wave)
    ring: () => gap("ring", 40) && (tone(1450, 0.035, { type: "triangle", v: 0.06, to: 1180, a: 0.002 }), noise(0.025, 0.035, 5200)),
    clasp: () => gap("clasp", 60) && (tone(2300, 0.05, { type: "square", v: 0.018, to: 1900, a: 0.002, lp: 5000 }), tone(1150, 0.08, { type: "triangle", v: 0.05, at: 0.02 })),
    chain: (k = 0) => { const f = 523.25 * Math.pow(2, (Math.min(k, 9) * 2) / 12); tone(f, 0.16, { type: "triangle", v: 0.08 }); tone(f * 1.5, 0.22, { v: 0.04, at: 0.05 }); if (k >= 2) tone(f * 2, 0.3, { v: 0.025, at: 0.1 }); },
    // ARCIA POKER LOUNGE: a card slides out (or flips), chips click onto the felt, a knock for a check, the shuffle
    card: () => gap("card", 45) && noise(0.07, 0.07, 3200, { to: 1400, a: 0.004 }),
    flip: () => gap("flip", 45) && (noise(0.04, 0.06, 5200, { a: 0.002 }), tone(900, 0.03, { type: "triangle", v: 0.025, to: 700 })),
    chip: (k = 1) => { if (!gap("chip", 50)) return; for (let i = 0; i < Math.min(4, 1 + k); i++) tone(2600 + Math.random() * 900, 0.03, { type: "triangle", v: 0.05, at: i * 0.045, a: 0.001, to: 2100 }); noise(0.03, 0.04, 6000); },
    knock: () => gap("knock", 80) && (tone(140, 0.06, { v: 0.12, to: 90 }), noise(0.04, 0.1, 500, { type: "lowpass" }), tone(150, 0.06, { v: 0.1, to: 95, at: 0.11 }), noise(0.04, 0.08, 500, { type: "lowpass", at: 0.11 })),
    shuffle: () => { for (let i = 0; i < 9; i++) noise(0.03, 0.045, 3000 + Math.random() * 2500, { at: i * 0.04 }); },
    tab: () => { if (!gap("tab", 50)) return; tone(1250, 0.045, { type: "triangle", v: 0.045, a: 0.003 }); tone(1680, 0.05, { type: "triangle", v: 0.03, at: 0.03, a: 0.003 }); },
    open: () => { if (!gap("panel", 120)) return; tone(520, 0.1, { type: "triangle", v: 0.06, to: 780 }); tone(1040, 0.1, { v: 0.025, at: 0.05 }); noise(0.09, 0.02, 2500, { to: 6000, a: 0.03 }); },
    close: () => { if (!gap("panel", 120)) return; tone(760, 0.09, { type: "triangle", v: 0.05, to: 470 }); noise(0.07, 0.015, 3000, { to: 1200 }); },
    equip: () => { tone(140, 0.1, { to: 90, v: 0.09 }); noise(0.05, 0.06, 1800); tone(1900, 0.12, { type: "square", v: 0.018, to: 1750, at: 0.02 }); tone(2850, 0.22, { v: 0.03, at: 0.02 }); },
    buy: () => { noise(0.04, 0.06, 4200); [1318, 1568, 2093, 2637].forEach((f, i) => tone(f, 0.14, { type: "triangle", v: 0.065, at: 0.03 + i * 0.05 })); tone(2637, 0.45, { v: 0.02, at: 0.25 }); },
    salvage: () => { for (let i = 0; i < 5; i++) noise(0.05, 0.11, 500 + Math.random() * 1100, { at: i * 0.035, q: 2 }); tone(110, 0.2, { type: "sawtooth", to: 55, v: 0.04, lp: 900 }); tone(1500, 0.12, { type: "triangle", v: 0.02, at: 0.2 }); },
    bad: () => { if (!gap("bad", 150)) return; tone(196, 0.09, { type: "square", v: 0.04, lp: 1600 }); tone(185, 0.13, { type: "square", v: 0.04, at: 0.11, lp: 1600 }); },
    // ---- progress ----
    pick: () => { if (now() < (hush.pick || 0)) return; tone(880, 0.12, { v: 0.12 }); tone(1320, 0.18, { v: 0.1, at: 0.08 }); },
    quest: () => { hush.pick = now() + 500; duck(0.4, 1.6); [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.18, { type: "triangle", v: 0.08, at: i * 0.08 })); tone(1568, 0.55, { v: 0.045, at: 0.34 }); tone(1976, 0.55, { v: 0.035, at: 0.34 }); noise(0.4, 0.015, 7000, { type: "highpass", at: 0.34, a: 0.05 }); },
    // da-da-da-daaa: a brassy line (a filtered saw over a triangle) and a sparkle at the top
    level: () => { hush.pick = now() + 600; duck(0.4, 1.6);
      [[523, 0, 0.1], [523, 0.11, 0.1], [523, 0.22, 0.1], [784, 0.33, 0.7]].forEach(([f, at, d]) => { tone(f, d, { type: "sawtooth", v: 0.045, at, lp: 2400 }); tone(f, d, { type: "triangle", v: 0.06, at }); });
      tone(659, 0.7, { type: "triangle", v: 0.04, at: 0.33 }); tone(1047, 0.7, { v: 0.035, at: 0.33 }); noise(0.6, 0.02, 8000, { type: "highpass", at: 0.36, a: 0.08 }); },
    drop: (r) => gap("drop", 60) && shimmer(r),
    // ---- combat ----
    // kind: the weapon (0 swords, 1 hammer, 2 blaster, 3 bow, 4 staff)
    swing: (heavy, kind) => {
      if (kind === 1) { noise(heavy ? 0.28 : 0.2, 0.14, 380, { to: 1400, a: 0.06, q: 1.2 }); tone(120, 0.2, { type: "triangle", to: 60, v: 0.06 }); }
      else if (kind === 2) { tone(1400, 0.12, { type: "square", to: 300, v: 0.03, lp: 3500 }); tone(2200, 0.08, { type: "sawtooth", to: 600, v: 0.018, lp: 4000 }); }
      else if (kind === 3) { tone(330, 0.25, { type: "triangle", v: 0.08, to: 310, a: 0.003 }); tone(660, 0.12, { type: "sawtooth", v: 0.015, lp: 1500, a: 0.003 }); noise(0.08, 0.05, 2500, { to: 5000 }); }
      else if (kind === 4) { tone(880, 0.2, { v: 0.04, to: heavy ? 1760 : 1320 }); noise(0.15, 0.05, 3000, { to: 6000, a: 0.04 }); }
      else { noise(heavy ? 0.16 : 0.11, heavy ? 0.14 : 0.11, heavy ? 900 : 1300, { to: heavy ? 3200 : 4200, a: 0.03, q: 1.5 }); tone(heavy ? 180 : 260, heavy ? 0.14 : 0.08, { type: "triangle", to: heavy ? 70 : 120, v: 0.06 }); }
    },
    // a hit lands, the weapon's own way: blades ring, the hammer thuds, the blaster zaps, an arrow thunks, the staff chimes
    impact: (kind) => kind === 1 ? (tone(90, 0.16, { to: 45, v: 0.13 }), noise(0.12, 0.12, 300)) : kind === 2 ? tone(1700, 0.08, { type: "square", to: 500, v: 0.04 }) : kind === 3 ? (noise(0.05, 0.1, 1100), tone(220, 0.06, { type: "triangle", to: 140, v: 0.05 })) : kind === 4 ? [1320, 1760].forEach((f, i) => tone(f, 0.14, { type: "triangle", v: 0.035, at: i * 0.04 })) : (tone(2100 + Math.random() * 400, 0.09, { type: "triangle", v: 0.04, to: 1600 }), noise(0.04, 0.08, 3800)),
    // what rides on a hit: the element's sound, a heavy blow's thud, a crit's ding
    hitFx: (kind, crit) => {
      if (kind === "pet") return;
      if ((kind === "fire" || kind === "meteor") && gap("fire", 45)) { for (let i = 0; i < 6; i++) noise(0.02, 0.07, 2000 + Math.random() * 3000, { type: "highpass", at: Math.random() * 0.25 }); noise(0.3, 0.06, 700, { type: "lowpass", a: 0.02 }); if (kind === "meteor") tone(70, 0.5, { to: 35, v: 0.12 }); }
      else if (kind === "ice" && gap("ice", 45)) { [2093, 2794, 3520].forEach((f, i) => tone(f, 0.3, { v: 0.028, at: i * 0.03, a: 0.003 })); noise(0.1, 0.035, 6000, { type: "highpass" }); }
      else if (kind === "shock" && gap("shock", 45)) { for (let i = 0; i < 3; i++) tone(600 + Math.random() * 1200, 0.04, { type: "sawtooth", v: 0.03, at: i * 0.035, lp: 4000, a: 0.002 }); noise(0.12, 0.05, 3500, { q: 3 }); }
      else if (kind === "heavy" && gap("thud", 45)) tone(70, 0.18, { to: 40, v: 0.11 });
      if (crit && gap("crit", 60)) { tone(2637, 0.35, { v: 0.04, a: 0.003 }); tone(3951, 0.25, { v: 0.022, at: 0.01, a: 0.003 }); tone(1319, 0.2, { type: "triangle", v: 0.03, a: 0.003 }); }
    },
    // a scammer falls: a pop and a coin, bigger for an elite, a boom and a rising run for a boss
    kill: (rank) => {
      if (!gap("kill", 40)) return;
      tone(620, 0.12, { to: 150, v: 0.1 }); noise(0.1, 0.1, 1500); [1568, 2093].forEach((f, i) => tone(f, 0.12, { type: "triangle", v: 0.06, at: 0.07 + i * 0.06 }));
      if (rank === "elite") { tone(98, 0.4, { to: 49, v: 0.1 }); noise(0.3, 0.08, 500, { type: "lowpass" }); }
      if (rank === "boss") { tone(55, 1.2, { to: 30, v: 0.15 }); noise(0.9, 0.12, 300, { type: "lowpass" }); [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, { type: "triangle", v: 0.06, at: 0.4 + i * 0.09 })); }
    },
    // ---- ARCIRCLE KART (2026-10-30, the owner: "Kart 손맛 패치") ----
    // the engine: two detuned saws through a low-pass that opens with the revs, and a band of noise for the tyres in a
    // drift; set(rpm 0..1, load 0..1, screech 0..1, boost) every frame, stop() when the race ends. null without sound.
    kartEngine: () => {
      if (!ac || !S.sound) return null;
      try {
        const g = ac.createGain(), lp = ac.createBiquadFilter(), a = ac.createOscillator(), b = ac.createOscillator(), sub = ac.createOscillator(), sg = ac.createGain();
        g.gain.value = 0; lp.type = "lowpass"; lp.frequency.value = 500; lp.Q.value = 2.5; a.type = b.type = "sawtooth"; sub.type = "square"; b.detune.value = 14; sg.gain.value = 0.35;
        a.connect(lp); b.connect(lp); sub.connect(sg); sg.connect(lp); lp.connect(g); g.connect(out);
        let tg = null, tf = null, tn = null;
        if (nbuf) { tn = ac.createBufferSource(); tn.buffer = nbuf; tn.loop = true; tf = ac.createBiquadFilter(); tf.type = "bandpass"; tf.frequency.value = 2400; tf.Q.value = 3; tg = ac.createGain(); tg.gain.value = 0; tn.connect(tf); tf.connect(tg); tg.connect(out); tn.start(); }
        a.start(); b.start(); sub.start(); let dead = false;
        return {
          set(rpm, load, screech = 0, boost = false) {
            if (dead) return; const t = ac.currentTime, r = Math.max(0, Math.min(1.25, rpm)), f = 46 + r * 120 + (boost ? 26 : 0);
            a.frequency.setTargetAtTime(f, t, 0.06); b.frequency.setTargetAtTime(f * 1.005, t, 0.06); sub.frequency.setTargetAtTime(f / 2, t, 0.06);
            lp.frequency.setTargetAtTime(380 + r * 1500 + load * 700 + (boost ? 900 : 0), t, 0.08);
            g.gain.setTargetAtTime(hidden() ? 0 : 0.05 + load * 0.035 + r * 0.025, t, 0.08);
            if (tg) { tg.gain.setTargetAtTime(hidden() ? 0 : screech * 0.05, t, 0.05); tf.frequency.setTargetAtTime(1900 + screech * 1400 + r * 400, t, 0.1); }
          },
          stop() { if (dead) return; dead = true; const t = ac.currentTime; g.gain.setTargetAtTime(0, t, 0.15); if (tg) tg.gain.setTargetAtTime(0, t, 0.1); setTimeout(() => { try { a.stop(); b.stop(); sub.stop(); if (tn) tn.stop(); g.disconnect(); if (tg) tg.disconnect(); } catch { /* gone */ } }, 900); },
        };
      } catch { return null; }
    },
    kartSpark: (lv = 1) => { if (!gap("kartSpark", 120)) return; tone([0, 1175, 1568, 2093][lv] || 1175, 0.12, { type: "triangle", v: 0.06 }); tone(([0, 1175, 1568, 2093][lv] || 1175) * 1.5, 0.1, { v: 0.03, at: 0.05 }); },
    kartTurbo: (lv = 1) => { if (!gap("kartTurbo", 150)) return; noise(0.35 + lv * 0.12, 0.1 + lv * 0.03, 900, { to: 4200, a: 0.02, q: 0.9 }); tone(180, 0.3 + lv * 0.1, { type: "sawtooth", to: 520 + lv * 160, v: 0.05, lp: 2400 }); },
    kartBump: (k = 0.5) => { if (!gap("kartBump", 140)) return; tone(110, 0.16, { type: "triangle", to: 55, v: 0.08 + k * 0.06 }); noise(0.12, 0.12 + k * 0.08, 700, { type: "lowpass", to: 200 }); noise(0.08, 0.05, 4200, { type: "highpass" }); },
    kartLap: (last = false) => { [784, 1047, last ? 1568 : 1319].forEach((f, i) => tone(f, 0.16, { type: "triangle", v: 0.08, at: i * 0.08 })); },
    kartPass: () => { if (!gap("kartPass", 600)) return; tone(880, 0.08, { type: "triangle", v: 0.06 }); tone(1320, 0.12, { type: "triangle", v: 0.06, at: 0.07 }); },
    kartStall: () => { noise(0.6, 0.09, 300, { type: "lowpass", to: 120 }); tone(90, 0.5, { type: "sawtooth", to: 40, v: 0.04, lp: 500 }); },
    // ---- the older set (kept as they were) ----
    enter: () => { tone(520, 0.1, { type: "triangle", v: 0.12 }); tone(780, 0.14, { type: "triangle", v: 0.1, at: 0.07 }); },
    rocket: () => { noise(1.6, 0.16, 180); tone(90, 1.4, { type: "sawtooth", to: 40, v: 0.05 }); },
    fire: () => noise(1.2, 0.14, 300), whale: () => tone(140, 2.2, { type: "sine", to: 90, v: 0.08 }), shutter: () => noise(0.06, 0.2, 2500),
    win: () => [659, 880, 1175].forEach((f, i) => tone(f, 0.2, { v: 0.12, at: i * 0.1 })),
    board: () => tone(200, 0.3, { type: "sawtooth", to: 420, v: 0.05 }),
    place: () => { tone(540 + Math.random() * 180, 0.07, { type: "triangle", v: 0.12 }); noise(0.04, 0.1, 2400); },
    pop: () => { tone(420, 0.1, { to: 190, v: 0.1 }); noise(0.08, 0.12, 1200); },
    paint: () => tone(900, 0.09, { to: 1300, v: 0.07 }),
    coin: () => gap("coin", 40) && [1046, 1318, 1568].forEach((f, i) => tone(f, 0.12, { type: "triangle", v: 0.09, at: i * 0.06 })),
    // a chest opens; r (its rarity) adds the drop's shimmer from Rare up
    chest: (r) => { if (r >= 3) duck(0.45, 1.4); noise(0.25, 0.1, 700); [523, 784, 1046].forEach((f, i) => tone(f, 0.2, { v: 0.1, at: 0.2 + i * 0.08 })); if (r >= 2) setTimeout(() => shimmer(r, 0.8), 300); },
    siren: () => [0, 0.32, 0.64].forEach((at) => tone(660, 0.28, { type: "sawtooth", to: 440, v: 0.05, at })),
    dash: () => noise(0.16, 0.08, 3200), thunder: () => { noise(2.6, 0.2, 110); noise(1.2, 0.08, 420); },
    heart: () => { tone(70, 0.09, { v: 0.12 }); tone(62, 0.09, { v: 0.1, at: 0.16 }); },
    cast: (k) => k === "ice" ? (tone(1400, 0.18, { to: 700, v: 0.07 }), noise(0.12, 0.06, 5000)) : k === "fire" ? (noise(0.3, 0.14, 500), tone(180, 0.25, { type: "sawtooth", to: 90, v: 0.05 })) : (noise(0.18, 0.12, 3500), tone(90, 0.2, { type: "square", to: 60, v: 0.05 })),
    hurt: () => { tone(200, 0.16, { type: "square", to: 110, v: 0.07 }); noise(0.1, 0.1, 900); },
    charge: (k) => tone(260 + k * 520, 0.08, { type: "triangle", v: 0.03 + k * 0.03 }),
    charged: () => { noise(0.35, 0.16, 900); tone(140, 0.4, { type: "sawtooth", to: 50, v: 0.07 }); tone(880, 0.25, { type: "triangle", to: 1320, v: 0.05 }); },
    // the Halloween Realm: the night's bell (three tolls), Inferno Jack's laugh, a pumpkin bursting, a candy pop
    bell: () => { duck(0.5, 3); [0, 1.1, 2.2].forEach((at) => { tone(196, 2.4, { type: "triangle", v: 0.09, at, a: 0.005 }); tone(392 * 1.19, 1.6, { v: 0.03, at, a: 0.005 }); tone(98, 2.6, { v: 0.05, at }); }); },
    laugh: () => gap("laugh", 2500) && [0, 0.2, 0.4, 0.62].forEach((at, i) => { tone(260 - i * 26, 0.17, { type: "sawtooth", v: 0.05, at, to: 190 - i * 20, lp: 1400 }); noise(0.12, 0.03, 900, { at }); }),
    pumpkin: () => gap("pumpkin", 120) && (tone(140, 0.25, { to: 60, v: 0.12 }), noise(0.2, 0.1, 700, { type: "lowpass" }), tone(880, 0.12, { type: "triangle", v: 0.03, at: 0.05, to: 1320 })),
    candy: () => gap("candy", 60) && (tone(1320, 0.08, { type: "triangle", v: 0.05, to: 1760 }), tone(1980, 0.1, { v: 0.025, at: 0.05 })),
    roar: () => { tone(110, 0.9, { type: "sawtooth", to: 55, v: 0.08 }); noise(0.7, 0.12, 400); },
    warn: () => tone(520, 0.16, { type: "square", v: 0.03, to: 480 }),
    // an AC Defense tower's arc, a countdown click (last: the brighter 1; go: a chord), a gather node struck
    zap: () => { if (!gap("zap", 80)) return; tone(900 + Math.random() * 500, 0.07, { type: "sawtooth", to: 2400, v: 0.025, lp: 5000, a: 0.002 }); noise(0.06, 0.04, 4500, { type: "highpass" }); },
    tick: (last, go) => { if (!gap("tick", 200)) return; tone(last ? 1320 : 990, 0.06, { type: "triangle", v: 0.08, a: 0.002 }); noise(0.025, 0.05, 2800, { q: 4 }); if (go) [523, 659, 784].forEach((f) => tone(f, 0.3, { type: "triangle", v: 0.05 })); },
    hit: () => { if (!gap("hit", 60)) return; tone(160, 0.08, { type: "triangle", to: 90, v: 0.07 }); noise(0.05, 0.08, 900, { type: "lowpass" }); },
    // knocked out: a falling minor line, a thud and a whoosh while the music dips; back up: a rising run
    ko: () => { hush.pick = now() + 1500; duck(0.3, 2.5); [440, 349, 294].forEach((f, i) => tone(f, 0.35, { type: "sawtooth", v: 0.05, at: i * 0.16, lp: 1400, to: f * 0.94 })); tone(70, 0.5, { to: 38, v: 0.13, at: 0.05 }); noise(0.45, 0.08, 1200, { to: 300, a: 0.04 }); },
    up: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: "triangle", v: 0.07, at: i * 0.06 })),
    // ---- the ARCL mine (world-mine.js) ----
    // the pick bites the rock: a stony crack and a short metal ring, higher for silver and gold (t 0–2)
    // Jurassic World: an axe in wood, a tree coming down, a bird far off, a dinosaur's growl and its bite
    chop: () => { if (!gap("chop", 60)) return; noise(0.07, 0.15, 520, { q: 1.6 }); tone(210, 0.09, { type: "triangle", to: 120, v: 0.08 }); tone(140, 0.12, { to: 80, v: 0.06, at: 0.01 }); },
    timber: () => { for (let i = 0; i < 9; i++) noise(0.05 + Math.random() * 0.06, 0.09, 300 + Math.random() * 900, { at: 0.05 + i * 0.07, type: "bandpass", q: 2 }); noise(0.5, 0.16, 180, { at: 0.75, type: "lowpass" }); tone(60, 0.5, { to: 32, v: 0.16, at: 0.75 }); },
    bird: () => { if (!gap("bird", 900)) return; const f = 2400 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) tone(f * (1 + (i % 2) * 0.12), 0.09, { v: 0.018, to: f * 1.25, at: i * 0.13, a: 0.005 }); },
    growl: (big = 0) => { if (!gap("growl", 400)) return; tone(big ? 70 : 120, 0.7 + big * 0.5, { type: "sawtooth", to: big ? 38 : 70, v: 0.06 + big * 0.03, lp: 700 }); noise(0.6 + big * 0.4, 0.08 + big * 0.05, big ? 260 : 420, { type: "lowpass", a: 0.08 }); },
    // b-jy2: a big dinosaur's foot (big 0–1: a raptor's patter to the Titan's quake), a spear's thrust, the water
    stomp: (big = 0.5) => { if (!gap("stomp", 90)) return; tone(48 + (1 - big) * 30, 0.3 + big * 0.25, { to: 32, v: 0.07 + big * 0.1 }); noise(0.2 + big * 0.2, 0.05 + big * 0.06, 180, { type: "lowpass" }); },
    thrust: () => { if (!gap("thrust", 120)) return; noise(0.13, 0.12, 1500, { to: 4200, a: 0.02, q: 1.6 }); tone(320, 0.08, { type: "triangle", to: 150, v: 0.04 }); },
    splash: (big = 0) => { if (!gap("splash", 120)) return; noise(0.25 + big * 0.3, 0.12 + big * 0.06, 1800, { to: 700, a: 0.01 }); for (let i = 0; i < 4; i++) tone(700 + Math.random() * 900, 0.06, { v: 0.02, at: 0.04 + i * 0.05, to: 1500 }); },
    plink: () => { if (!gap("plink", 200)) return; tone(1400, 0.08, { v: 0.05, to: 900 }); tone(1900, 0.06, { v: 0.03, at: 0.07, to: 1200 }); },
    reel: (k = 0) => { if (!gap("reel", 55)) return; tone(2200 + k * 600, 0.02, { type: "square", v: 0.016, lp: 5000, a: 0.001 }); noise(0.02, 0.03, 4000); },
    // a ping to the people round you: here (bright), help (urgent), gather (warm)
    ping: (k = "here") => { if (!gap("ping", 150)) return; if (k === "help") { tone(880, 0.12, { type: "square", v: 0.03, lp: 3000 }); tone(660, 0.16, { type: "square", v: 0.03, at: 0.13, lp: 3000 }); } else if (k === "gather") { [523, 659, 784].forEach((f, i) => tone(f, 0.2, { type: "triangle", v: 0.05, at: i * 0.07 })); } else { tone(1318, 0.1, { type: "triangle", v: 0.06 }); tone(1760, 0.16, { v: 0.04, at: 0.08 }); } },
    // SURVIVORS ARENA (b-sv7): a voice for each weapon, the gem run's rising notes, a heartbeat when you're low, the boss's drum
    svShot: () => { if (!gap("svShot", 90)) return; tone(1250 + Math.random() * 250, 0.05, { type: "square", to: 620, v: 0.012, lp: 4200, a: 0.002 }); },
    svOrb: () => { if (!gap("svOrb", 260)) return; tone(330, 0.12, { type: "triangle", to: 520, v: 0.02 }); noise(0.06, 0.03, 1600, { q: 2 }); },
    svBlade: () => { if (!gap("svBlade", 220)) return; noise(0.12, 0.045, 2600, { to: 900, q: 0.8, a: 0.01 }); },
    svDrone: () => { if (!gap("svDrone", 130)) return; tone(2300 + Math.random() * 300, 0.03, { type: "square", v: 0.008, lp: 6000, a: 0.001 }); },
    svLaser: () => { if (!gap("svLaser", 260)) return; tone(220, 0.3, { type: "sawtooth", to: 1100, v: 0.025, lp: 3200, a: 0.02 }); noise(0.25, 0.03, 3000, { type: "highpass", at: 0.05 }); },
    svMeteor: () => { if (!gap("svMeteor", 300)) return; noise(0.55, 0.06, 900, { to: 160, type: "lowpass", a: 0.05 }); tone(64, 0.32, { to: 34, v: 0.13, at: 0.62 }); noise(0.2, 0.1, 400, { type: "lowpass", at: 0.62 }); },
    svIce: () => { if (!gap("svIce", 300)) return; for (let i = 0; i < 5; i++) tone(2600 + Math.random() * 1800, 0.05, { v: 0.012, at: i * 0.035, to: 1800 }); noise(0.12, 0.03, 6000, { type: "highpass" }); },
    svPoison: () => { if (!gap("svPoison", 420)) return; for (let i = 0; i < 3; i++) tone(260 + Math.random() * 220, 0.06, { type: "sine", to: 520, v: 0.03, at: i * 0.07 }); },
    svHole: () => { if (!gap("svHole", 600)) return; tone(58, 0.9, { to: 38, v: 0.09, a: 0.08 }); tone(116, 0.7, { type: "triangle", to: 70, v: 0.025, a: 0.1 }); },
    svGem: (k = 0) => { if (!gap("svGem", 40)) return; const f = 1050 * Math.pow(2, Math.min(24, k) / 12); tone(f, 0.05, { v: 0.022, to: f * 1.12, a: 0.002 }); },
    svCombo: (n = 50) => { const top = n >= 250 ? 4 : n >= 100 ? 3 : 2; [784, 988, 1175, 1568, 1976].slice(0, top + 1).forEach((f, i) => tone(f, 0.12, { v: 0.035, at: i * 0.055 })); },
    svHeart: () => { if (!gap("svHeart", 700)) return; tone(58, 0.11, { v: 0.14 }); tone(52, 0.12, { v: 0.11, at: 0.17 }); },
    svDrum: (hard = 0) => { if (!gap("svDrum", 300)) return; tone(hard ? 62 : 74, 0.22, { to: 38, v: hard ? 0.12 : 0.07 }); noise(0.08, hard ? 0.07 : 0.04, 500, { type: "lowpass" }); },
    // a perfect dodge: a whoosh and a bright chime
    perfect: () => { noise(0.22, 0.1, 900, { to: 5000, a: 0.03 }); tone(2093, 0.4, { v: 0.04, at: 0.05 }); tone(3136, 0.3, { v: 0.025, at: 0.09 }); },
    // the boss hour is coming: a low horn, twice
    horn: () => { duck(0.4, 2.4); [0, 0.85].forEach((at) => { tone(110, 0.75, { type: "sawtooth", v: 0.05, at, lp: 700, a: 0.12 }); tone(165, 0.75, { type: "sawtooth", v: 0.03, at, lp: 900, a: 0.12 }); }); },
    bite: () => { if (!gap("bite", 120)) return; noise(0.06, 0.18, 1400, { q: 1.2 }); tone(190, 0.1, { type: "square", to: 90, v: 0.05 }); },
    chink: (t = 0) => { if (!gap("chink", 50)) return; noise(0.07, 0.16, 1500 + t * 500, { q: 2.5 }); tone(170, 0.07, { type: "triangle", to: 85, v: 0.07 }); tone([1900, 2600, 3100][t] || 1900, 0.16, { v: 0.03 + t * 0.008, a: 0.002, to: ([1900, 2600, 3100][t] || 1900) * 0.97 }); },
    // the rock gives way: rubble, a thump; gold adds a bright run
    crumble: (t = 0) => { for (let i = 0; i < 6; i++) noise(0.06 + Math.random() * 0.05, 0.12, 250 + Math.random() * 700, { at: i * 0.04, type: "lowpass", q: 0.8 }); tone(75, 0.3, { to: 40, v: 0.13 }); if (t >= 1) [1568, 2093, 2637].slice(0, t + 1).forEach((f, i) => tone(f, 0.16, { type: "triangle", v: 0.05, at: 0.12 + i * 0.06 })); },
    // nothing inside: a hollow puff and a little falling "wah"
    dud: () => { noise(0.25, 0.08, 600, { type: "lowpass", to: 200 }); tone(330, 0.32, { type: "triangle", to: 220, v: 0.05, at: 0.08 }); },
    // gold: the music dips, a deep hit and a long, rising sparkle
    jackpot: () => { hush.pick = now() + 1800; duck(0.3, 2.4); tone(65, 0.8, { to: 40, v: 0.14 }); [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => tone(f, 0.32, { type: "triangle", v: 0.07, at: 0.12 + i * 0.07 })); noise(1.2, 0.035, 7000, { type: "highpass", at: 0.2, a: 0.1 }); shimmer(4, 0.9); },
    // ---- Settings: Sound effects (volume) and Footsteps, under Music ----
    settings(T = (s) => s) {
      const mus = document.getElementById("wp-set-music"), row = mus && mus.closest(".wp-set-row"); if (!row || document.getElementById("wp-set-sfx")) return;
      const a = document.createElement("label"); a.className = "wp-set-row"; a.setAttribute("data-no-i18n", "");
      a.innerHTML = `<span>${esc(T("Sound effects"))}</span><input type="range" id="wp-set-sfx" min="0" max="100" step="5" aria-label="${esc(T("Effects volume"))}">`;
      const b = document.createElement("label"); b.className = "wp-set-row wp-set-line"; b.setAttribute("data-no-i18n", "");
      b.innerHTML = `<span>${esc(T("Footsteps while running"))}</span><input type="checkbox" id="wp-set-steps">`;
      row.after(a, b);
      const r = a.querySelector("input"), c = b.querySelector("input"); r.value = String(S.sfx ?? 70); c.checked = stepsOn();
      r.addEventListener("input", () => { S.sfx = Math.round(Number(r.value)); api.volume(); });
      r.addEventListener("change", () => { saveSet(); api.pick(); });
      c.addEventListener("change", () => { S.steps = c.checked; saveSet(); });
    },
    /// one sound rendered offline (tests): its peak and RMS through the same volume and clipper
    async render(name, args = [], secs = 2) {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OAC) return null;
      const c = new OAC(1, Math.ceil(44100 * secs), 44100), keep = [ac, out, nbuf, V, S.sound], g0 = { ...gaps }, h0 = { ...hush };
      ac = c; out = chain(c); nbuf = noiseBuf(c); V = { n: 0 }; S.sound = true; for (const k in gaps) delete gaps[k]; for (const k in hush) delete hush[k];
      try { api[name](...args); } finally { [ac, out, nbuf, V, S.sound] = keep; Object.assign(gaps, g0); Object.assign(hush, h0); }
      const d = (await c.startRendering()).getChannelData(0); let peak = 0, sum = 0; for (let i = 0; i < d.length; i++) { const x = Math.abs(d[i]); if (x > peak) peak = x; sum += x * x; }
      return { peak, rms: Math.sqrt(sum / d.length) };
    },
  };
  // the UI's own sounds, with no hooks: a modal dialog appearing or going, a tab, a button in a panel
  if (typeof document !== "undefined" && typeof MutationObserver !== "undefined" && document.body) {
    const dlg = (n) => n.nodeType === 1 && n.getAttribute("role") === "dialog" && n.getAttribute("aria-modal") === "true";
    new MutationObserver((list) => {
      let o = 0, c = 0;
      for (const m of list) {
        if (m.type === "attributes") { if (dlg(m.target) && (m.oldValue !== null) !== m.target.hidden) m.target.hidden ? c++ : o++; }
        else { m.addedNodes.forEach((n) => { if (dlg(n) && !n.hidden) o++; }); m.removedNodes.forEach((n) => { if (dlg(n) && !n.hidden) c++; }); }
      }
      if (o) api.open(); else if (c) api.close();
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"], attributeOldValue: true });
    // a click gets a tap only if nothing else made a sound since the finger went down (the click's own sound wins)
    let downT = 0;
    addEventListener("pointerdown", () => { downT = now(); }, { capture: true, passive: true });
    addEventListener("click", (e) => {
      const b = e.target && e.target.closest && e.target.closest('button, [role="tab"], input[type="checkbox"]'); if (!b || b.disabled || b.closest(".wp-acts, [data-nosnd]")) return;
      const tabby = b.matches('[role="tab"], .wp-seg button'); if (!tabby && !b.closest('[role="dialog"]') && !b.classList.contains("wp-btn")) return;
      const t = now(), ref = t - downT < 1000 ? downT : t;
      setTimeout(() => { if (lastAt >= ref) return; tabby ? api.tab() : api.tap(); }, 0);
    }, { capture: true, passive: true });
  }
  return api;
}
