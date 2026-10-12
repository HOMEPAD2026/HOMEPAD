// world-music.js — background music that follows where you are and what's happening: a calm track in town and on
// your island, a hunting track in the grounds, the boss track while a boss is up (and the weekly raid), and a short
// fanfare when a boss falls. Tracks cross-fade (about 2.5 s); a missing file falls back to the next calmer one, and
// with no files at all the game simply stays with its sound effects and ambience.
//
// Files: /audio/music/<name>.mp3 (see TRACKS). Volume: Settings → Music (0 turns it off); Sound off silences it too.
// Each track is streamed by an <audio> element through a gain node (iOS ignores <audio>.volume, a gain node works).
const TRACKS = { calm: "calm.mp3", hunt: "hunt.mp3", boss: "boss.mp3", victory: "victory.mp3" };
const FALLBACK = { boss: "hunt", hunt: "calm", calm: null };
const FADE = 2.5;

export function createMusic({ base = "/audio/music/", ver = "", volume = 0.55, on = () => true } = {}) {
  let ctx = null, master = null, cur = null, want = "calm", vol = volume, started = false, sting = null;
  const ok = {}, el = {}; // ok[name]: true once it can play, false when it failed to load
  function load(name) {
    if (el[name]) return el[name];
    const a = new Audio(); a.src = base + TRACKS[name] + ver; a.preload = name === "calm" ? "auto" : "metadata"; a.loop = name !== "victory"; a.crossOrigin = "anonymous";
    a.addEventListener("canplay", () => { ok[name] = true; pick(); }, { once: true });
    a.addEventListener("error", () => { ok[name] = false; pick(); }, { once: true });
    const g = ctx.createGain(); g.gain.value = 0; ctx.createMediaElementSource(a).connect(g); g.connect(master);
    el[name] = { a, g, name }; return el[name];
  }
  function fadeTo(t, v, secs = FADE) { const g = t.g.gain, now = ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(v, now + secs); }
  function pick() {
    if (!ctx || !started) return;
    // the wanted track once it has loaded; meanwhile (or if it never loads) the next calmer one that has
    let name = want, play = null;
    while (name) { if (ok[name]) { play = name; break; } if (ok[name] === undefined) load(name); name = FALLBACK[name]; }
    if (!play || (cur && cur.name === play)) return; name = play;
    const next = load(name), prev = cur; cur = next;
    if (next.a.paused) { if (name !== "victory") try { next.a.currentTime = 0; } catch { /* not seekable yet */ } next.a.play().catch(() => {}); }
    fadeTo(next, 1);
    if (prev) { fadeTo(prev, 0); const pa = prev.a; setTimeout(() => { if (cur !== prev) pa.pause(); }, FADE * 1000 + 200); }
  }
  /// call once from a tap or a key (browsers only start sound after one)
  function start() {
    if (started) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { ctx = new AC(); } catch { return; }
    master = ctx.createGain(); master.gain.value = on() ? vol : 0; master.connect(ctx.destination);
    started = true; load("calm"); pick();
    document.addEventListener("visibilitychange", () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
  }
  /// the mood now: "calm", "hunt" or "boss" (a short wait before calming down, so a fight's edge doesn't flip-flop)
  let calmAt = 0;
  function set(mood) {
    const rank = { calm: 0, hunt: 1, boss: 2 };
    if (rank[mood] >= rank[want]) { calmAt = 0; if (mood !== want) { want = mood; pick(); } return; }
    if (!calmAt) calmAt = performance.now() + (want === "boss" ? 6000 : 3500);
    if (performance.now() >= calmAt) { calmAt = 0; want = mood; pick(); }
  }
  /// a boss fell: the music dips, the fanfare plays once, then the ground's track comes back
  function victory() {
    if (!ctx || !started || ok.victory === false) return;
    const v = load("victory"); if (cur) fadeTo(cur, 0.15, 0.4);
    const go = () => { try { v.a.currentTime = 0; } catch { /* fine */ } v.g.gain.setValueAtTime(1, ctx.currentTime); v.a.play().catch(() => {}); clearTimeout(sting); sting = setTimeout(() => { if (cur) fadeTo(cur, 1, 2); }, Math.max(3000, (v.a.duration || 5) * 1000)); };
    if (ok.victory) go(); else v.a.addEventListener("canplay", go, { once: true });
  }
  function setVolume(k) { vol = Math.max(0, Math.min(1, k)); if (master) master.gain.setTargetAtTime(on() ? vol : 0, ctx.currentTime, 0.2); }
  return { start, set, victory, setVolume, refresh: () => setVolume(vol), state: () => ({ started, want, playing: cur && cur.name, ok: { ...ok } }) };
}
