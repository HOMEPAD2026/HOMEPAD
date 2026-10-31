// world-kart-music.js — ARCIRCLE KART's racing music (KX2, 2026-10-31, the owner: "KART has no music"): an upbeat electronic
// loop per track, made in the browser with WebAudio like world-sfx.js — nothing to download. Nexus Circuit synthwave
// (driving 8th-note bass, a saw lead, a pad), Lunar Loop spacey arps with an echo, Frost Drift bright bells and plucks,
// Magma Run a driving 16th bass with toms. A song is 16-bar sections that add and drop parts (drums + bass → + arp →
// + lead → a variation) with a fill at the end of every 4 bars; the FINAL LAP lifts the tempo ×1.06 and plays every part
// with 16th hats. A fanfare at the finish (bright for a podium, softer past it) and a short podium jingle.
//
// It plays through world-music.js's volume node (bus(): Settings → Music, the note button and Sound off all act on it)
// while the playlist is held (hold(true)), so it never doubles the town's music. Low CPU: notes are scheduled ~0.15 s
// ahead on the AudioContext's clock from a 50 ms timer (the usual look-ahead scheduler), each note one oscillator (two for
// a bell) and a gain, a few shared nodes (mix → duck → the music's volume, one delay send); nothing is scheduled while
// the music is off or the tab is hidden; low graphics drops the pad and the echo.
//
// Pure parts (tests/world/kart.test.mjs): STYLES, patternAt(style, bar, step, final) → the step's notes, bpmOf, hz.

export const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const SC = { minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], major: [0, 2, 4, 5, 7, 9, 11], phryg: [0, 1, 3, 5, 7, 8, 10] };
/// a scale degree (0-based, any integer) → semitones above the root
export const deg = (scale, d) => { const s = SC[scale] || SC.minor, o = Math.floor(d / 7); return s[((d % 7) + 7) % 7] + 12 * o; };
/// the four tracks' styles: tempo, key (MIDI root), scale, the chord loop (scale degrees, a bar each), the drums (16 steps:
/// k kick, s snare / clap, h hat, o open hat, t tom), the bass's rhythm (b root, B the octave, f the fifth), the arp's chord
/// tones (in chord steps: 0 root, 1 third, 2 fifth, 3 octave), the lead's 2-bar motif (16ths, scale degrees over the chord's root,
/// null = rest), the voices' waves
export const STYLES = {
  nexus: { name: "synthwave", bpm: 124, root: 45, scale: "minor", prog: [0, 5, 2, 6], kick: "k...k...k...k...", snare: "....s.......s...", hat: "..h...h...h...h.", bass: "b.B.b.B.b.B.b.B.", arp: [0, 1, 2, 3, 2, 1, 0, 2], arpEvery: 2, lead: [7, null, 9, 7, null, 4, null, 5, 4, null, 2, null, 0, null, 2, null, 7, null, 9, 11, null, 9, 7, null, 6, null, 4, null, 2, null, null, null], wave: { bass: "sawtooth", arp: "square", lead: "sawtooth" }, pad: true, echo: false },
  moon: { name: "space arps", bpm: 112, root: 50, scale: "dorian", prog: [0, 3, 5, 4], kick: "k.......k.k.....", snare: "........s.......", hat: "h.h.h.h.h.h.h.h.", bass: "b.......f...b...", arp: [0, 2, 3, 2, 1, 3, 2, 3], arpEvery: 1, lead: [9, null, null, null, 7, null, 8, null, 7, null, null, null, 4, null, null, null, 9, null, 11, null, 9, null, 7, null, 6, null, null, null, 4, null, null, null], wave: { bass: "triangle", arp: "triangle", lead: "square" }, pad: true, echo: true },
  ice: { name: "bells", bpm: 132, root: 52, scale: "major", prog: [0, 4, 5, 3], kick: "k...k...k...k...", snare: "....s.......s..s", hat: "..h...h...h...hh", bass: "b..b..b...b..f..", arp: [0, 1, 2, 3, 0, 1, 2, 3], arpEvery: 2, lead: [7, null, 8, 9, null, 7, null, 4, 5, null, 4, null, 2, null, null, null, 7, null, 9, 11, null, 12, null, 11, 9, null, 7, null, 9, null, null, null], wave: { bass: "triangle", arp: "bell", lead: "bell" }, pad: false, echo: true },
  volcano: { name: "drive", bpm: 138, root: 40, scale: "phryg", prog: [0, 0, 5, 6], kick: "k..k..k.k..k..k.", snare: "....s.......s...", hat: "h.h.h.h.h.h.h.h.", bass: "bbbBbbbbbbBbbbfb", arp: [0, 2, 0, 3, 0, 2, 1, 2], arpEvery: 2, lead: [7, null, 8, null, 7, null, 5, 4, null, null, 4, 5, 7, null, null, null, 8, null, 10, null, 8, 7, null, 5, 4, null, 1, null, 0, null, null, null], wave: { bass: "sawtooth", arp: "square", lead: "square" }, pad: false, echo: false, toms: "..............tt" },
};
export const FINAL_K = 1.06;
export const bpmOf = (st, final) => st.bpm * (final ? FINAL_K : 1);
/// which parts play in a bar: a 16-bar song of four 4-bar sections — 0 drums + bass (+ pad), 1 + arp, 2 + lead, 3 the lead
/// over an arp an octave up; the last bar of each section ends in a fill; the final lap plays everything, with 16th hats
export function partsOf(bar, final) { const sec = Math.floor(bar / 4) % 4, fill = bar % 4 === 3;
  return final ? { arp: true, lead: true, up: bar % 2 === 1, fill, hats16: true } : { arp: sec >= 1, lead: sec >= 2, up: sec === 3, fill, hats16: false }; }
/// one 16th step's notes: [{ v: voice, m: MIDI note, d: length in steps, g: gain 0..1 }]
export function patternAt(st, bar, step, final = false) {
  const out = [], P = partsOf(bar, final), chord = st.prog[bar % st.prog.length], at = (p) => p[step] && p[step] !== ".";
  const fillNow = P.fill && step >= 12, ct = (n) => deg(st.scale, chord + [0, 2, 4, 7][n]);
  if (at(st.kick) && !(fillNow && step > 12)) out.push({ v: "kick", g: 1 });
  if (fillNow) out.push({ v: "snare", g: 0.45 + (step - 12) * 0.15 }); else if (at(st.snare)) out.push({ v: "snare", g: 0.8 });
  if (P.hats16 || at(st.hat)) out.push({ v: st.hat[step] === "o" ? "ohat" : "hat", g: at(st.hat) ? 0.7 : 0.4 });
  if (st.toms && at(st.toms)) out.push({ v: "tom", m: st.root + 12 + (step % 2 ? 0 : 5), g: 0.8 });
  const b = st.bass[step]; if (b && b !== ".") { const m = st.root + deg(st.scale, chord) + (b === "B" ? 12 : b === "f" ? 7 : 0) - (st.root > 44 ? 12 : 0); out.push({ v: "bass", m, d: st.bass[step + 1] === "." ? 1.8 : 0.9, g: b === "B" ? 0.75 : 0.9 }); }
  if (step === 0 && st.pad) out.push({ v: "pad", m: st.root + 12 + deg(st.scale, chord), d: 16, g: 0.5 });
  if (P.arp && step % st.arpEvery === 0) { const n = st.arp[(step / st.arpEvery) % st.arp.length]; out.push({ v: "arp", m: st.root + (st.root >= 45 ? 12 : 24) + (P.up ? 12 : 0) + ct(n), d: st.arpEvery * 0.9, g: 0.55 }); }
  if (P.lead) { const L = st.lead[(bar % 2) * 16 + step]; if (L != null) out.push({ v: "lead", m: st.root + (st.root >= 45 ? 12 : 24) + deg(st.scale, L), d: 1.8, g: 0.6 }); }
  return out;
}
const LOOK = 0.15, TICK = 50, MIX = 0.45; // (MIX: under the engine and the effects — the town's tracks play at the same music volume)

/// the music: bus() → { ctx, out } (world-music.js), on() → the music is on, low → the cheap mix
export function createKartMusic({ bus, on = () => true, low = false } = {}) {
  let ac = null, out = null, mix = null, duckG = null, echo = null, nbuf = null, iv = 0, st = null, tid = "", bar = 0, step = 0, nextT = 0, fin = false, live = false, made = 0; const alive = new Set(); // (the sources still sounding)
  function chain() {
    const b = bus && bus(); if (!b || !b.ctx) return false; if (ac === b.ctx && mix) return true;
    ac = b.ctx; out = b.out; mix = ac.createGain(); mix.gain.value = 0; duckG = ac.createGain(); duckG.gain.value = 1; mix.connect(duckG); duckG.connect(out);
    if (!low) { const d = ac.createDelay(1), fb = ac.createGain(), send = ac.createGain(); d.delayTime.value = 0.36; fb.gain.value = 0.32; send.gain.value = 0; send.connect(d); d.connect(fb); fb.connect(d); d.connect(duckG); mix.connect(send); echo = { d, fb, send }; }
    const n = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), x = n.getChannelData(0); for (let i = 0; i < x.length; i++) x[i] = Math.random() * 2 - 1; nbuf = n;
    return true;
  }
  const end = (src) => { made++; alive.add(src); src.onended = () => { alive.delete(src); }; };
  function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function osc(type, f, t, dur, peak, { a = 0.005, to = 0, lp = 0, dest = mix, det = 0 } = {}) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + Math.min(dur, 0.14)); if (det) o.detune.value = det;
    env(g, t, a, peak, dur); if (lp) { const fl = ac.createBiquadFilter(); fl.type = "lowpass"; fl.frequency.setValueAtTime(lp * 2.2, t); fl.frequency.exponentialRampToValueAtTime(lp, t + Math.min(dur, 0.25)); fl.Q.value = 3; o.connect(fl); fl.connect(g); } else o.connect(g);
    g.connect(dest); o.start(t); o.stop(t + dur + 0.03); end(o); return g;
  }
  function noise(t, dur, peak, f, type = "highpass") {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = nbuf; fl.type = type; fl.frequency.value = f; fl.Q.value = 0.8; env(g, t, 0.002, peak, dur);
    s.connect(fl); fl.connect(g); g.connect(mix); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02); end(s);
  }
  function play(n, t, sd) {
    const W = st.wave, f = n.m ? hz(n.m) : 0, d = (n.d || 1) * sd;
    if (n.v === "kick") osc("sine", 150, t, 0.26, 0.9 * n.g, { a: 0.002, to: 44 });
    else if (n.v === "snare") { noise(t, 0.14, 0.32 * n.g, 1700, "bandpass"); osc("triangle", 190, t, 0.08, 0.18 * n.g, { a: 0.002, to: 120 }); }
    else if (n.v === "hat") noise(t, 0.035, 0.12 * n.g, 7600);
    else if (n.v === "ohat") noise(t, 0.16, 0.1 * n.g, 6800);
    else if (n.v === "tom") osc("sine", f, t, 0.2, 0.5 * n.g, { a: 0.003, to: f * 0.55 });
    else if (n.v === "bass") osc(W.bass, f, t, d, 0.26 * n.g, { a: 0.006, lp: W.bass === "sawtooth" ? 420 : 0 });
    else if (n.v === "pad") { if (low) return; for (const det of [-9, 9]) osc("sawtooth", f, t, d, 0.035 * n.g, { a: 0.5, lp: 700, det }); }
    else { const peak = (n.v === "lead" ? 0.11 : 0.08) * n.g, w = n.v === "lead" ? W.lead : W.arp;
      if (w === "bell") { osc("sine", f, t, d + 0.5, peak * 1.3, { a: 0.003 }); osc("sine", f * 2.76, t, 0.3, peak * 0.45, { a: 0.002 }); }
      else osc(w, f, t, d, peak, { a: 0.004, lp: w === "sawtooth" ? 1800 : 0 });
    }
  }
  function sched() {
    if (!live || !ac) return; if (!on() || ac.state !== "running" || (typeof document !== "undefined" && document.hidden)) { nextT = 0; return; }
    const now = ac.currentTime; if (nextT < now) nextT = now + 0.05;
    const sd = 60 / bpmOf(st, fin) / 4;
    while (nextT < now + LOOK) { for (const n of patternAt(st, bar, step, fin)) play(n, nextT, sd); nextT += sd; if (++step >= 16) { step = 0; bar++; } }
  }
  const api = {
    /// the loop for a track (from its first bar; again for the next race)
    start(track) {
      if (!chain()) return false; api.stopLoop(); st = STYLES[track] || STYLES.nexus; tid = STYLES[track] ? track : "nexus"; bar = 0; step = 0; fin = false; nextT = 0; live = true;
      const t = ac.currentTime; mix.gain.cancelScheduledValues(t); mix.gain.setValueAtTime(mix.gain.value, t); mix.gain.linearRampToValueAtTime(MIX, t + 0.6);
      if (echo) echo.send.gain.value = st.echo ? 0.28 : 0; // (the echo: Lunar Loop's and Frost Drift's arps and bells ring on)
      sched(); iv = setInterval(sched, TICK); return true;
    },
    /// the loop stops (the notes already scheduled ring out); fade: how fast it fades
    stopLoop(fade = 0) { live = false; clearInterval(iv); iv = 0; if (fade && mix && ac) { const t = ac.currentTime; mix.gain.cancelScheduledValues(t); mix.gain.setValueAtTime(mix.gain.value, t); mix.gain.linearRampToValueAtTime(0, t + fade); } },
    /// the final lap: faster, every part
    final(v = true) { fin = !!v; },
    /// under a loud effect (a hit, a blast, a lap's chime): down to depth for secs, then back
    duck(depth = 0.45, secs = 0.6) { if (!duckG || !ac) return; const t = ac.currentTime, g = duckG.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(depth, t + 0.04); g.setValueAtTime(depth, t + secs); g.linearRampToValueAtTime(1, t + secs + 0.35); },
    /// the finish: the loop stops and a fanfare plays (a rising major arpeggio + a held chord for a podium place, a softer
    /// minor turn past it)
    fanfare(place = 1) {
      if (!chain() || !on()) { api.stopLoop(); return; } api.stopLoop(0.15); const t = ac.currentTime + 0.18, s = st || STYLES.nexus, r = s.root + 24, good = place <= 3, g = 0.12;
      mix.gain.cancelScheduledValues(t - 0.1); mix.gain.setValueAtTime(MIX, t - 0.02);
      const notes = good ? [0, 4, 7, 12, 16] : [0, 3, 7, 10]; notes.forEach((n, i) => osc("sawtooth", hz(r + n), t + i * 0.09, 0.22, g, { a: 0.004, lp: 2400 }));
      const at = t + notes.length * 0.09; for (const n of good ? [0, 4, 7, 12] : [0, 3, 7]) { osc("sawtooth", hz(r + n), at, 1.2, g * 0.7, { a: 0.01, lp: 1800 }); osc("square", hz(r + n + 12), at, 0.9, g * 0.25, { a: 0.01 }); }
      osc("sine", 150, at, 0.3, 0.8, { a: 0.002, to: 44 }); noise(at, 0.6, 0.12, 6000);
      return true;
    },
    /// the podium: a short bell jingle over a cymbal
    jingle() { if (!chain() || !on()) return false; const t = ac.currentTime + 0.05, r = (st || STYLES.nexus).root + 36;
      [0, 4, 7, 12, 7, 12, 16].forEach((n, i) => { osc("sine", hz(r + n), t + i * 0.12, 0.5, 0.09, { a: 0.003 }); osc("sine", hz(r + n) * 2.76, t + i * 0.12, 0.2, 0.03, { a: 0.002 }); });
      noise(t, 1.2, 0.06, 7000); return true; },
    /// everything let go (leaving KART)
    stop() { api.stopLoop(0.25); const m = mix, d = duckG, e = echo; mix = duckG = echo = null; ac = null; setTimeout(() => { try { if (m) m.disconnect(); if (d) d.disconnect(); if (e) { e.d.disconnect(); e.fb.disconnect(); e.send.disconnect(); } } catch { /* gone */ } }, 1800); },
    state: () => ({ live, track: tid, bar, final: fin, voices: alive.size, made, ctx: ac ? ac.state : "none", chain: !!mix }),
  };
  return api;
}
