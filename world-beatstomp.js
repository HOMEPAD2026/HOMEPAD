// world-beatstomp.js — Beat Stomp, the Game Village's rhythm game (loaded the first time its door is used, like Coin Jump).
// Three pads on the square; rings of light fall onto them in time with a beat. Tap the pad's button (or A / S / D, the
// arrow keys) as a ring lands: you hop onto that pad, Perfect or Good, and the combo grows. About a minute a song;
// the chart changes every day (the Seoul date). A run keeps its best on this device; it pays nothing.
//
// The beat is made here with Web Audio (a kick, a snare, hats, a bass line) and scheduled on the audio clock, so the
// rings and the sound agree to the millisecond; the town's music dips while a song plays. With the sound off the
// game runs on the same clock, silent, and the pads flash on the beat.
//
// ctx: { THREE, planet, T, lang, esc, toast, Snd, vfx, reduce, low, coarse, origin {x,z}, keep: [objects that stay],
//        soundOn(), music { duck(depth, secs) }, place(x, z), boost(v), setArena(r), leave(), warm(), onDone(stats) }
const BPM = 120, SPB = 60 / BPM, BEATS = 124, LEAD = 8, APPROACH = 1.7, DROP = 7, LANE_W = 2.3;
const PERFECT = 0.07, GOOD = 0.16, BEST = "arc.world.beatBest";
const LW = {
  ko: { "Beat Stomp": "비트 스톰프", Score: "점수", Combo: "콤보", Quit: "그만두기", Perfect: "퍼펙트", Good: "굿", Miss: "미스", "Tap the pad as the ring lands!": "링이 내려앉을 때 발판을 누르세요!", "Song clear!": "곡 완주!", "Max combo": "최대 콤보", "New best!": "최고 기록!", Best: "최고", "Play again": "다시 하기", Leave: "나가기", "Sound is off: follow the lights": "소리가 꺼져 있어요: 빛을 따라가세요" },
  zh: { "Beat Stomp": "节拍踩踏", Score: "分数", Combo: "连击", Quit: "退出", Perfect: "完美", Good: "不错", Miss: "失误", "Tap the pad as the ring lands!": "光环落下时点击踏板！", "Song clear!": "完成歌曲！", "Max combo": "最高连击", "New best!": "新纪录！", Best: "最佳", "Play again": "再玩一次", Leave: "离开", "Sound is off: follow the lights": "声音已关闭：跟随灯光" },
  tr: { "Beat Stomp": "Ritim Adımı", Score: "Puan", Combo: "Kombo", Quit: "Çık", Perfect: "Mükemmel", Good: "İyi", Miss: "Kaçtı", "Tap the pad as the ring lands!": "Halka inerken platforma dokun!", "Song clear!": "Şarkı tamam!", "Max combo": "En yüksek kombo", "New best!": "Yeni rekor!", Best: "En iyi", "Play again": "Tekrar oyna", Leave: "Ayrıl", "Sound is off: follow the lights": "Ses kapalı: ışıkları takip et" },
};
const LANE_C = [0x38d8ff, 0xff5ad8, 0xffd23a];

export function createBeatStomp(ctx) {
  const { THREE, planet, esc } = ctx, L = LW[ctx.lang] || {}, T = (s, v) => (L[s] != null ? L[s] : ctx.T(s, v));
  const O = ctx.origin || { x: 0, z: 0 }, laneX = (i) => O.x + (i - 1) * LANE_W, laneZ = O.z;
  let on = false, phase = "idle", root = null, ui = null, hidden = [], notes = [], score = 0, combo = 0, maxCombo = 0, counts = { p: 0, g: 0, m: 0 }, lastLane = 1;
  let ac = null, master = null, t0 = 0, sched = 0, schedT = 0, clock0 = 0, paused = 0, pauseAt = 0;
  const rng = (s0) => { let s = s0 | 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const dayNo = () => Math.floor((Date.now() + 9 * 3600e3) / 864e5);

  // ---------------- the chart: a ring on most beats, a few half-beats later in the song, never the same pad 3 times ----------------
  function chart() {
    const r = rng(dayNo() * 104729 + 7), out = []; let run = 0, prev = -1;
    for (let b = LEAD; b < BEATS - 4; b++) {
      const late = b > BEATS * 0.55, p = b < 24 ? 0.55 : late ? 0.8 : 0.7;
      const put = (t) => { let lane = Math.floor(r() * 3); if (lane === prev && ++run >= 2) { lane = (lane + 1 + Math.floor(r() * 2)) % 3; run = 0; } else if (lane !== prev) run = 0; prev = lane; out.push({ t, lane, done: false, ring: null }); };
      if (r() < p) put(b * SPB);
      if (late && r() < 0.18) put((b + 0.5) * SPB);
    }
    return out;
  }

  // ---------------- the stage: three pads, their rims, a ring pool, a backdrop arch (made once, kept between songs) ----------------
  let made = false, pads = [], rims = [], ringPool = [], arch = null, beatLight = null;
  function build() {
    if (!made) {
      made = true; root = new THREE.Group(); root.name = "beatstomp";
      const glow = (c, k, o = {}) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4, ...o });
      const padG = new THREE.CylinderGeometry(1, 0.85, 0.4, 6), rimG = new THREE.TorusGeometry(1.02, 0.07, 6, 6), ringG = new THREE.TorusGeometry(0.95, 0.09, 8, 36);
      for (let i = 0; i < 3; i++) {
        const p = new THREE.Mesh(padG, new THREE.MeshStandardMaterial({ color: 0xe8f2ff, emissive: LANE_C[i], emissiveIntensity: 0.15, roughness: 0.35, metalness: 0.1, flatShading: true }));
        p.position.set(laneX(i), 0.2, laneZ); p.rotation.y = Math.PI / 6; p.receiveShadow = true; root.add(p); pads.push(p);
        const rm = new THREE.Mesh(rimG, glow(LANE_C[i], 1.6)); rm.rotation.x = Math.PI / 2; rm.rotation.z = Math.PI / 6; rm.position.set(laneX(i), 0.41, laneZ); root.add(rm); rims.push(rm);
      }
      for (let k = 0; k < 18; k++) { const m = new THREE.Mesh(ringG, glow(0xffffff, 1.8, { transparent: true })); m.rotation.x = Math.PI / 2; m.visible = false; root.add(m); ringPool.push(m); }
      // the backdrop: an arch of light behind the pads that pulses on the beat
      arch = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.16, 8, 48, Math.PI), glow(0xb48cff, 1.4)); arch.position.set(O.x, 0, laneZ - 3.2); root.add(arch);
      beatLight = new THREE.Mesh(new THREE.CircleGeometry(4.2, 40), new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: 0, depthWrite: false })); beatLight.rotation.x = -Math.PI / 2; beatLight.position.set(O.x, 0.06, laneZ); root.add(beatLight);
    }
    planet.add(root);
    if (ctx.warm) try { ctx.warm(); } catch { /* compiled on first sight */ }
  }
  const KEEP = /^(ground|particles|smoke|pet|grass|clouds|ambient|vfx|decor)$/;
  function hideWorld() { hidden = []; for (const c of planet.children) if (c.visible && c !== root && !KEEP.test(c.name || "") && !(ctx.keep || []).includes(c) && !c.isLight) { c.visible = false; hidden.push(c); } }
  function showWorld() { for (const c of hidden) c.visible = true; hidden = []; }

  // ---------------- the beat (Web Audio, scheduled ahead on the audio clock) ----------------
  function audioStart() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return false;
    try { ac = new AC(); } catch { ac = null; return false; }
    master = ac.createGain(); master.gain.value = ctx.soundOn && !ctx.soundOn() ? 0 : 0.5; master.connect(ac.destination);
    if (ac.state === "suspended") ac.resume().catch(() => {});
    return true;
  }
  const noise = (() => { let buf = null; return () => { if (!buf) { buf = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return buf; }; })();
  function kick(t) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.26); }
  function hiss(t, len, freq, type, v) { const s = ac.createBufferSource(); s.buffer = noise(); const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = ac.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + len); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + len + 0.02); }
  function tone(t, f, len, type, v) { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len); o.connect(g); g.connect(master); o.start(t); o.stop(t + len + 0.02); }
  const BASS = [55, 55, 65.4, 49, 55, 55, 73.4, 65.4];
  function scheduleBeat(b, at) { // one beat of the groove at audio time `at`
    kick(at); hiss(at + SPB / 2, 0.05, 7000, "highpass", 0.18);
    if (b % 2 === 1) hiss(at, 0.16, 1800, "bandpass", 0.35);
    if (b >= LEAD - 4) tone(at, BASS[(b >> 1) % BASS.length], SPB * 0.9, "triangle", 0.22);
    if (b >= LEAD && b % 8 === 0) [261.6, 329.6, 392].forEach((f) => tone(at, f * 2, SPB * 1.6, "sine", 0.05));
  }
  function scheduler() {
    if (!ac || phase !== "run") return;
    const ahead = ac.currentTime + 0.15;
    while (sched < BEATS && t0 + sched * SPB < ahead) { scheduleBeat(sched, t0 + sched * SPB); sched++; }
  }
  // the song's time: the audio clock when there is one (it stops while the app is in the background), else performance.now
  const songT = () => (ac ? ac.currentTime - t0 : (performance.now() - clock0 - paused) / 1000);

  // ---------------- the HUD, the lane buttons, the result card ----------------
  function mountUi() {
    ui = document.createElement("div"); ui.className = "wb-ui"; ui.setAttribute("data-no-i18n", "");
    ui.innerHTML = `<div class="wb-hud" data-game-hud><b>${esc(T("Beat Stomp"))}</b><span class="wb-s"></span><span class="wb-c"></span><button type="button" data-wb="quit">${esc(T("Quit"))}</button></div>
      <div class="wb-judge" aria-live="polite"></div>
      <div class="wb-lanes">${[0, 1, 2].map((i) => `<button type="button" class="wb-lane l${i}" data-lane="${i}" aria-label="${["◀", "●", "▶"][i]}">${["◀", "●", "▶"][i]}</button>`).join("")}</div>
      <div class="wb-res" hidden></div>`;
    ui.addEventListener("pointerdown", (ev) => { const b = ev.target.closest("[data-lane]"); if (!b) return; ev.preventDefault(); hit(+b.dataset.lane); b.classList.remove("hit"); void b.offsetWidth; b.classList.add("hit"); });
    ui.addEventListener("click", (ev) => { const b = ev.target.closest("[data-wb]"); if (!b) return; const k = b.dataset.wb; if (k === "quit") finish(true); else if (k === "again") { exit(true); start(); } else if (k === "leave") exit(); });
    document.body.appendChild(ui);
    addEventListener("keydown", onKey, true);
  }
  const KEYS = { KeyA: 0, ArrowLeft: 0, KeyS: 1, ArrowDown: 1, KeyD: 2, ArrowRight: 2 };
  function onKey(e) { if (phase !== "run" || e.repeat) return; const l = KEYS[e.code]; if (l == null) return; e.preventDefault(); e.stopPropagation(); hit(l); }
  const last = { s: -1, c: -1 };
  function paintHud() {
    if (!ui) return;
    if (score !== last.s) { last.s = score; ui.querySelector(".wb-s").textContent = `${T("Score")} ${score.toLocaleString()}`; }
    if (combo !== last.c) { last.c = combo; const el = ui.querySelector(".wb-c"); el.textContent = combo >= 2 ? `${T("Combo")} ${combo}` : ""; }
  }
  let judgeT = 0;
  function judge(kind) {
    const el = ui && ui.querySelector(".wb-judge"); if (!el) return;
    el.textContent = T(kind); el.className = "wb-judge " + kind.toLowerCase(); void el.offsetWidth; el.classList.add("in"); judgeT = 0.6;
  }

  // ---------------- play ----------------
  const mult = () => 1 + Math.min(2, Math.floor(combo / 10) * 0.5);
  function hit(lane) {
    if (phase !== "run") return;
    const now = songT(); lastLane = lane;
    if (ctx.place) ctx.place(laneX(lane), laneZ + 0.01); if (ctx.boost) ctx.boost(4.5); // you hop onto the pad
    let best = null, bd = 1e9;
    for (const n of notes) { if (n.done || n.lane !== lane) continue; const d = Math.abs(n.t - now); if (d < bd) { bd = d; best = n; } if (n.t - now > GOOD) break; }
    if (best && bd <= GOOD) {
      best.done = true; if (best.ring) { best.ring.visible = false; best.ring = null; }
      const perfect = bd <= PERFECT; combo++; maxCombo = Math.max(maxCombo, combo); score += Math.round((perfect ? 300 : 100) * mult()); counts[perfect ? "p" : "g"]++;
      judge(perfect ? "Perfect" : "Good");
      if (ac) tone(ac.currentTime, [523.3, 659.3, 784][lane] * (perfect ? 2 : 1), 0.12, "triangle", 0.12);
      if (ctx.vfx && ctx.vfx.collect && !ctx.reduce && (perfect || !ctx.low)) ctx.vfx.collect(new THREE.Vector3(laneX(lane), 0.5, laneZ), LANE_C[lane]);
      const r = rims[lane]; if (r) r.material.emissiveIntensity = 4;
    } else if (!notes.some((n) => !n.done && Math.abs(n.t - now) < 0.4)) { combo = 0; } // a tap with nothing near breaks the combo
    paintHud();
  }
  function start() {
    if (on) return; on = true; phase = "run"; score = 0; combo = 0; maxCombo = 0; counts = { p: 0, g: 0, m: 0 }; last.s = last.c = -1;
    try {
      hideWorld(); build(); mountUi(); ctx.setArena(10); if (ctx.place) ctx.place(laneX(1), laneZ + 0.01);
      notes = chart();
      const sound = audioStart();
      t0 = (ac ? ac.currentTime : 0) + 0.6; sched = 0; clock0 = performance.now() + 600; paused = 0;
      schedT = setInterval(scheduler, 25); scheduler();
      if (ctx.music && ctx.music.duck) ctx.music.duck(0.05, BEATS * SPB + 3);
      paintHud(); ctx.toast(T("Tap the pad as the ring lands!"));
      if (!sound || (ctx.soundOn && !ctx.soundOn())) setTimeout(() => { if (on) ctx.toast(T("Sound is off: follow the lights")); }, 1800);
    } catch (err) { exit(); throw err; }
  }
  function stopAudio() { clearInterval(schedT); schedT = 0; if (ac) { const a = ac; ac = null; try { a.close(); } catch { /* gone */ } } }
  function finish(quit) {
    if (phase !== "run") return; phase = "over"; stopAudio();
    if (ctx.music && ctx.music.duck) ctx.music.duck(1, 0.1);
    for (const r of ringPool) r.visible = false;
    const clear = !quit, total = notes.length, acc = total ? Math.round(((counts.p + counts.g * 0.5) / total) * 100) : 0;
    let best = 0; try { best = Number(localStorage.getItem(BEST)) || 0; } catch { /* private */ }
    const nb = clear && score > best; if (nb) try { localStorage.setItem(BEST, String(score)); } catch { /* private */ }
    if (clear && ctx.onDone) try { ctx.onDone({ score, acc, maxCombo }); } catch { /* the quest log is optional */ }
    if (clear && nb && ctx.vfx && ctx.vfx.levelUp && !ctx.reduce) ctx.vfx.levelUp();
    const r = ui && ui.querySelector(".wb-res"); if (!r) return; r.hidden = false;
    r.innerHTML = `<div class="wb-card"><small>${esc(T("Beat Stomp"))}</small><h3>${esc(clear ? T("Song clear!") : T("Quit"))}</h3><div class="wb-big">${score.toLocaleString()}</div>
      <p>${esc(T("Perfect"))} ${counts.p} · ${esc(T("Good"))} ${counts.g} · ${esc(T("Miss"))} ${counts.m} · ${acc}%</p><p>${esc(T("Max combo"))} ${maxCombo}</p>
      <p>${esc(nb ? T("New best!") : `${T("Best")}: ${Math.max(best, clear ? score : 0).toLocaleString()}`)}</p>
      <div class="wb-btns"><button type="button" class="go" data-wb="again">${esc(T("Play again"))}</button><button type="button" data-wb="leave">${esc(T("Leave"))}</button></div></div>`;
  }
  function exit(again) {
    stopAudio(); if (ctx.music && ctx.music.duck) ctx.music.duck(1, 0.1);
    on = false; phase = "idle"; removeEventListener("keydown", onKey, true); if (ui) { ui.remove(); ui = null; }
    if (root) planet.remove(root); for (const r of ringPool) r.visible = false; notes = [];
    if (!again) { showWorld(); ctx.setArena(0); if (ctx.leave) ctx.leave(); } else showWorld();
  }
  // the app in the background: the audio clock stops with it (a performance.now clock is paused by hand)
  document.addEventListener("visibilitychange", () => { if (!on || phase !== "run") return; if (document.hidden) { pauseAt = performance.now(); if (ac) ac.suspend().catch(() => {}); } else { if (!ac) paused += performance.now() - pauseAt; else ac.resume().catch(() => {}); } });

  function tick(dt, t) {
    if (!on || !root) return;
    for (const r of rims) r.material.emissiveIntensity += (1.6 - r.material.emissiveIntensity) * Math.min(1, dt * 8);
    if (judgeT > 0 && (judgeT -= dt) <= 0 && ui) ui.querySelector(".wb-judge").classList.remove("in");
    if (phase !== "run") return;
    const now = songT();
    // the beat: the floor glow and the arch pulse on every beat
    const bp = now / SPB, ph = bp - Math.floor(bp), pulse = now > 0 ? Math.max(0, 1 - ph * 3) : 0;
    beatLight.material.opacity = pulse * 0.22; arch.material.emissiveIntensity = 1.2 + pulse * 1.6;
    // rings: from DROP high down to the pad, landing at their time; late by more than GOOD is a miss
    let free = 0;
    for (const n of notes) {
      if (n.done) continue;
      const d = n.t - now;
      if (d < -GOOD) { n.done = true; counts.m++; combo = 0; judge("Miss"); if (n.ring) { n.ring.visible = false; n.ring = null; } paintHud(); continue; }
      if (d > APPROACH) break;
      if (!n.ring) { while (free < ringPool.length && ringPool[free].visible) free++; if (free >= ringPool.length) continue; n.ring = ringPool[free]; n.ring.visible = true; n.ring.material.color.setHex(LANE_C[n.lane]); n.ring.material.emissive.setHex(LANE_C[n.lane]); }
      const k = Math.max(0, d / APPROACH); n.ring.position.set(laneX(n.lane), 0.45 + k * DROP, laneZ); n.ring.scale.setScalar(1 + k * 0.35); n.ring.material.opacity = 0.35 + (1 - k) * 0.65;
    }
    if (now > BEATS * SPB + 0.5) finish(false);
  }
  return { start, quit: () => { if (phase === "run") finish(true); else if (on) exit(); }, reset: () => { if (on) exit(); }, active: () => on, tick, debug: () => ({ phase, score, combo, counts: { ...counts }, notes: notes.length, now: on ? +songT().toFixed(2) : 0, next: (notes.find((n) => !n.done) || {}).t, lane: (notes.find((n) => !n.done) || {}).lane }), hit };
}
