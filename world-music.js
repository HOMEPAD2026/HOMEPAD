// world-music.js — the background music: six K-pop tracks played in a shuffled order, one after another, with a short
// cross-fade between them (no track twice in a row, and every track before any repeats). It plays the same in town,
// in the grounds and on your island; when a boss falls the music dips for a moment.
//
// Files: /audio/music/kpop-1.mp3 … kpop-6.mp3 (credits: audio/music/CREDITS.txt). On and off: the note button in the
// top bar (Settings → Music sets the volume; Sound off silences it too). A track that fails to load is skipped.
// Each track is streamed by an <audio> element through a gain node (iOS ignores <audio>.volume, a gain node works).
export const PLAYLIST = ["kpop-1", "kpop-2", "kpop-3", "kpop-4", "kpop-5", "kpop-6"];
/// what each track is (audio/music/CREDITS.txt): shown on the stage's screen while it plays
export const TITLES = { "kpop-1": ["Epic K-pop Music", "ribhavagrawal"], "kpop-2": ["Tell Me", "kontraa"], "kpop-3": ["Modern K-pop", "kulakovka"], "kpop-4": ["Han River Nights", "ultrafi"], "kpop-5": ["Neon Run", "sounovamusic"], "kpop-6": ["K-pop", "kulakovka"] };
const FADE = 2.5;

export function createMusic({ base = "/audio/music/", ver = "", volume = 0.55, on = () => true, list = PLAYLIST, rnd = Math.random } = {}) {
  let ctx = null, master = null, cur = null, vol = volume, started = false, order = [], last = "", dipT = 0, failed = 0;
  let analyser = null, fbuf = null, slow = 0, beat = 0; // the beat: bass energy against its own running average (the town's lights pulse with it)
  // a fresh shuffle once the last one is used up; never the track that just played first
  function nextName() {
    if (!order.length) { order = list.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } if (order.length > 1 && order[0] === last) order.push(order.shift()); }
    return order.shift();
  }
  function track(name) {
    const a = new Audio(); a.src = base + name + ".mp3" + ver; a.preload = "auto"; a.crossOrigin = "anonymous";
    const g = ctx.createGain(); g.gain.value = 0; ctx.createMediaElementSource(a).connect(g); g.connect(master);
    const t = { a, g, name, done: false };
    // a little before the end the next one starts and the two cross-fade
    a.addEventListener("timeupdate", () => { if (!t.done && cur === t && a.duration && a.duration - a.currentTime < FADE + 0.2) { t.done = true; playNext(); } });
    a.addEventListener("ended", () => { if (!t.done && cur === t) { t.done = true; playNext(); } });
    a.addEventListener("error", () => { if (cur === t && !t.done) { t.done = true; if (++failed < list.length * 2) playNext(); } }, { once: true });
    a.addEventListener("playing", () => { failed = 0; }, { once: true });
    return t;
  }
  function fadeTo(t, v, secs = FADE) { const g = t.g.gain, now = ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(v, now + secs); }
  function playNext() {
    if (!ctx || !started) return;
    const name = nextName(); last = name;
    const next = track(name), prev = cur; cur = next;
    next.a.play().catch(() => {});
    fadeTo(next, 1, prev ? FADE : 1.2);
    if (prev) { fadeTo(prev, 0); const pa = prev.a; setTimeout(() => { pa.pause(); pa.removeAttribute("src"); try { pa.load(); } catch { /* fine */ } }, FADE * 1000 + 300); }
  }
  /// call once from a tap or a key (browsers only start sound after one)
  function start() {
    if (started) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { ctx = new AC(); } catch { return; }
    master = ctx.createGain(); master.gain.value = on() ? vol : 0; master.connect(ctx.destination);
    try { analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.6; master.connect(analyser); fbuf = new Uint8Array(analyser.frequencyBinCount); } catch { analyser = null; }
    started = true;
    if (on()) playNext();
    document.addEventListener("visibilitychange", () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
  }
  /// where you are ("calm", "hunt", "boss"): the playlist plays the same everywhere, so this only keeps the old call working
  function set() {}
  /// a boss fell: the music dips for a moment, then comes back
  function victory() {
    if (!ctx || !cur) return; const c = cur; fadeTo(c, 0.25, 0.3); clearTimeout(dipT); dipT = setTimeout(() => { if (cur === c) fadeTo(c, 1, 2); }, 2600);
  }
  /// the volume (0…1); off (Sound off, the music button, or a volume of 0) pauses the track instead of playing it silent
  function setVolume(k) {
    vol = Math.max(0, Math.min(1, k)); if (!master) return;
    const live = on() && vol > 0;
    master.gain.setTargetAtTime(live ? vol : 0, ctx.currentTime, 0.2);
    if (live) { if (ctx.state === "suspended" && !document.hidden) ctx.resume().catch(() => {}); if (!cur) playNext(); else if (cur.a.paused) cur.a.play().catch(() => {}); }
    else if (cur) { const c = cur; setTimeout(() => { if (!(on() && vol > 0) && cur === c) c.a.pause(); }, 700); }
  }
  /// 0…1: how hard the beat is hitting right now (0 when the music is off or paused)
  function level() {
    if (!analyser || !cur || cur.a.paused || !(on() && vol > 0)) { beat *= 0.9; return beat; }
    analyser.getByteFrequencyData(fbuf); let b = 0; for (let i = 1; i < 7; i++) b += fbuf[i]; b /= 6 * 255;
    slow += (b - slow) * 0.05; const hit = Math.max(0, Math.min(1, (b - slow) * 5 + b * 0.35));
    beat = Math.max(hit, beat * 0.88); return beat;
  }
  /// skip to another track
  function skip() { if (cur) { cur.done = true; } playNext(); }
  return { start, set, victory, setVolume, skip, level, refresh: () => setVolume(vol), state: () => ({ started, playing: cur && cur.name, paused: cur ? cur.a.paused : true, order: order.slice() }) };
}
