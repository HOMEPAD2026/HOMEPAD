// world-live.js — the platform, live in the town: an LED band that turns round the plaza fountain with $ARCIRCLE's
// price and day's move, how much of it has been burned, the holders, the ArcPad launches so far and the newest coin
// (from the site's own /api/social?token=arcircle and /api/c?view=launches, refreshed every minute); and fireworks
// over the Launch district when a new coin launches.
export function createLive({ THREE, planet, parts, at = [0, 7.2, 0], reduce = false }) {
  const H = 112, cv = document.createElement("canvas"); cv.width = 1024; cv.height = H;
  const g = cv.getContext("2d"), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(2, 1); tex.anisotropy = 4;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.9, 96, 1, true), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.FrontSide, toneMapped: false }));
  const rim = new THREE.MeshBasicMaterial({ color: 0x38e8ff, toneMapped: false });
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(3.62, 0.035, 6, 96), rim), r2 = r1.clone(); r1.rotation.x = r2.rotation.x = Math.PI / 2; r1.position.y = 0.47; r2.position.y = -0.47;
  const root = new THREE.Group(); root.position.set(...at); root.add(band, r1, r2); root.name = "live-band"; planet.add(root);
  let text = "ARCIRCLE  ·  arcircle.app";
  const fmtP = (p) => (p >= 0.01 ? p.toFixed(4) : p.toPrecision(3));
  const big = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n)));
  // one turn of the line fills the canvas exactly, and the band repeats it at the text's own proportions (the band is
  // 22.6 m round and 0.9 m tall), so it wraps without a seam and nothing stretches
  function paint() {
    const items = text.split("|"), font = "800 58px 'Big Shoulders Display', Sora, sans-serif"; g.font = font;
    const gap = 90, w = Math.max(512, Math.min(4096, Math.ceil(items.reduce((a, p) => a + g.measureText(p).width + gap, 0))));
    if (cv.width !== w) { cv.width = w; tex.dispose(); }
    g.font = font; g.textBaseline = "middle"; g.clearRect(0, 0, w, H); g.fillStyle = "rgba(6,12,22,.88)"; g.fillRect(0, 0, w, H);
    let x = gap / 2;
    for (const p of items) { g.fillStyle = /▲/.test(p) ? "#5dffa8" : /▼/.test(p) ? "#ff7a9a" : "#e8f6ff"; g.fillText(p, x, H / 2 + 2); x += g.measureText(p).width + gap; g.fillStyle = "#38e8ff"; g.fillText("◆", x - gap / 2 - 14, H / 2); }
    tex.repeat.set(Math.max(1, Math.round(((2 * Math.PI * 3.6) / 0.9) * (H / w))), 1); tex.needsUpdate = true;
  }
  paint();
  async function refresh() {
    try {
      const [a, l] = await Promise.all([fetch("/api/social?token=arcircle").then((r) => (r.ok ? r.json() : null)).catch(() => null), fetch("/api/c?view=launches").then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
      const bits = [];
      if (a && a.price) bits.push(`$ARCIRCLE  $${fmtP(a.price)}  ${a.change24h >= 0 ? "▲" : "▼"} ${Math.abs(a.change24h || 0).toFixed(1)}%`);
      if (a && a.burned && a.burned.tokens) bits.push(`BURNED  ${big(a.burned.tokens)}  (${(a.burned.pct || 0).toFixed(2)}%)`);
      if (a && a.holders) bits.push(`HOLDERS  ${a.holders.toLocaleString("en-US")}`);
      const ls = l && Array.isArray(l.launches) ? l.launches.filter((c) => c && c.symbol) : [];
      if (ls.length) { const n = ls.slice().sort((x, y) => (y.launchedAt || 0) - (x.launchedAt || 0))[0]; bits.push(`ARCPAD LAUNCHES  ${ls.length}`); bits.push(`NEWEST  $${String(n.symbol).slice(0, 12)}`); }
      else if (a && a.revenue && a.revenue.launches) bits.push(`ARCPAD LAUNCHES  ${a.revenue.launches}`);
      if (bits.length) { text = bits.join("|"); paint(); }
    } catch { /* offline: the last line stays */ }
  }
  refresh(); const iv = setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  // fireworks: shells climb, then burst into a sphere of sparks in two colours; a few at a time
  const COLS = [[0x2f86ff, 0x9fd0ff], [0x2ee07a, 0xb8ffd8], [0xffc861, 0xfff2c8], [0xb48cff, 0xf0e2ff], [0xff4d6d, 0xffc8d2]];
  const timers = new Set();
  function shell(x, z, delay, h) {
    const t = setTimeout(() => {
      timers.delete(t); const c = COLS[Math.floor(Math.random() * COLS.length)];
      parts.emit({ at: new THREE.Vector3(x, 1.5, z), kind: "glow", n: 8, speed: h * 1.25, dir: new THREE.Vector3(0, 1, 0), spread: 0.04, life: 0.9, size: 0.5, grav: 9, drag: 0.4, color: 0xfff2c8 });
      const t2 = setTimeout(() => {
        timers.delete(t2); const p = new THREE.Vector3(x, 1.5 + h * 0.62, z), d = new THREE.Vector3();
        for (let i = 0; i < 14; i++) { d.set(Math.random() - 0.5, Math.random() - 0.4, Math.random() - 0.5).normalize(); parts.emit({ at: p, kind: "streak", n: 6, speed: 13, dir: d, spread: 0.14, life: 1.5, size: 0.42, grav: 3.5, drag: 1.0, color: c[1], color2: c[0] }); }
        parts.emit({ at: p, kind: "glow", n: 26, speed: 7, life: 1.4, size: 1.1, grav: 2, drag: 1.3, color: c[0] });
      }, 820); timers.add(t2);
    }, delay); timers.add(t);
  }
  function fireworks(x, z, n = 6) { if (reduce) return; for (let i = 0; i < n; i++) shell(x + (Math.random() - 0.5) * 10, z + (Math.random() - 0.5) * 10, i * 420 + Math.random() * 200, 14 + Math.random() * 6); }
  return {
    root, refresh, fireworks,
    tick(dt) { if (!reduce) { tex.offset.x -= dt * 0.025; root.rotation.y += dt * 0.05; } },
    dispose() { clearInterval(iv); timers.forEach(clearTimeout); },
  };
}
