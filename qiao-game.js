// qiao-game.js — 橋 Jump. A tiny Chrome-dino-style endless runner: the 橋
// mascot runs along a bridge and hops over red envelopes (🧧). Tap, click,
// Space or ArrowUp to jump. Score climbs with distance, speed climbs with
// score, high score persists in localStorage. Self-contained: no
// dependencies, no network, nothing on-chain — it's just for fun.

(function () {
  const canvas = document.getElementById("qiao-game");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const GROUND_Y = H - 46;
  const HISCORE_KEY = "homepad.qiao.hiscore";

  const sprite = new Image();
  sprite.src = "images/qiao-sprite.jpg";

  const state = {
    phase: "idle", // idle | running | over
    player: { x: 64, y: GROUND_Y, vy: 0, size: 60, onGround: true, rot: 0 },
    obstacles: [],
    speed: 5.2,
    dist: 0,
    score: 0,
    hiscore: 0,
    spawnTimer: 0,
    lanterns: [],
    popups: [],
    lastT: 0,
    bgOffset: 0,
  };
  try { state.hiscore = Number(localStorage.getItem(HISCORE_KEY) || 0); } catch { /* fine */ }

  // decorative background lanterns, parallax
  for (let i = 0; i < 7; i++) state.lanterns.push({ x: Math.random() * W, y: 30 + Math.random() * 70, s: 0.6 + Math.random() * 0.8 });

  const GRAVITY = 0.62, JUMP_V = -12.4;
  const MILESTONES = { 100: "Nice!", 300: "橋!", 500: "Bridge builder", 1000: "Legend", 2000: "PONS who?" };

  function reset() {
    state.player = { x: 64, y: GROUND_Y, vy: 0, size: 60, onGround: true, rot: 0 };
    state.obstacles = [];
    state.speed = 5.2;
    state.dist = 0;
    state.score = 0;
    state.spawnTimer = 60;
    state.popups = [];
  }

  function jump() {
    if (state.phase === "idle") { reset(); state.phase = "running"; }
    if (state.phase === "over") { reset(); state.phase = "running"; return; }
    const p = state.player;
    if (p.onGround) { p.vy = JUMP_V; p.onGround = false; }
  }

  function spawnObstacle() {
    const count = Math.random() < 0.28 && state.score > 150 ? 2 : 1; // a double every so often once you're warmed up
    state.obstacles.push({ x: W + 20, w: 34 * count, h: 40, count });
    state.spawnTimer = 70 + Math.random() * 60 - Math.min(35, state.score / 40);
  }

  function update(dt) {
    if (state.phase !== "running") return;
    const p = state.player;
    p.vy += GRAVITY * dt;
    p.y += p.vy * dt;
    if (p.y >= GROUND_Y) { p.y = GROUND_Y; p.vy = 0; p.onGround = true; }
    p.rot = p.onGround ? 0 : Math.max(-0.35, Math.min(0.35, p.vy * 0.03));

    state.speed = 5.2 + Math.min(6, state.score / 250);
    state.dist += state.speed * dt;
    const newScore = Math.floor(state.dist / 10);
    if (newScore !== state.score) {
      state.score = newScore;
      if (MILESTONES[state.score]) state.popups.push({ text: MILESTONES[state.score], t: 0 });
    }

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) spawnObstacle();
    for (const o of state.obstacles) o.x -= state.speed * dt;
    state.obstacles = state.obstacles.filter((o) => o.x + o.w > -10);

    state.bgOffset = (state.bgOffset + state.speed * 0.25 * dt) % W;
    for (const l of state.lanterns) { l.x -= state.speed * 0.15 * l.s * dt; if (l.x < -30) l.x = W + 30; }
    for (const pp of state.popups) pp.t += dt;
    state.popups = state.popups.filter((pp) => pp.t < 70);

    // collision (forgiving hitbox — it's a meme game, not a rhythm game)
    const px = p.x + 10, py = p.y - p.size + 12, pw = p.size - 20, ph = p.size - 14;
    for (const o of state.obstacles) {
      const ox = o.x + 4, oy = GROUND_Y - o.h, ow = o.w - 8, oh = o.h;
      if (px < ox + ow && px + pw > ox && py < oy + oh && py + ph > oy) {
        state.phase = "over";
        if (state.score > state.hiscore) {
          state.hiscore = state.score;
          try { localStorage.setItem(HISCORE_KEY, String(state.hiscore)); } catch { /* fine */ }
        }
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function draw() {
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#2a0606"); g.addColorStop(1, "#5a1010");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // parallax lanterns
    ctx.font = "22px serif";
    ctx.textAlign = "center";
    for (const l of state.lanterns) { ctx.globalAlpha = 0.35 * l.s; ctx.fillText("🏮", l.x, l.y); }
    ctx.globalAlpha = 1;

    // bridge deck (橋 = bridge!)
    ctx.fillStyle = "#3b0d0d"; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = "#7a2020";
    for (let x = -state.bgOffset; x < W; x += 44) ctx.fillRect(x, GROUND_Y, 32, 6);
    ctx.fillStyle = "#c93b3b"; ctx.fillRect(0, GROUND_Y, W, 2);

    // obstacles: red envelopes
    ctx.font = "34px serif";
    for (const o of state.obstacles) for (let i = 0; i < o.count; i++) ctx.fillText("🧧", o.x + 17 + i * 34, GROUND_Y - 4);

    // player
    const p = state.player;
    ctx.save();
    ctx.translate(p.x + p.size / 2, p.y - p.size / 2);
    ctx.rotate(p.rot);
    ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    roundRect(-p.size / 2, -p.size / 2, p.size, p.size, 14);
    ctx.clip();
    ctx.shadowBlur = 0;
    if (sprite.complete && sprite.naturalWidth) ctx.drawImage(sprite, -p.size / 2, -p.size / 2, p.size, p.size);
    else { ctx.fillStyle = "#ff6b6b"; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); }
    ctx.restore();
    // running-in-place bounce only feels alive if there's a shadow on the deck
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.beginPath(); ctx.ellipse(p.x + p.size / 2, GROUND_Y + 3, 22 * (p.onGround ? 1 : 0.6), 5, 0, 0, Math.PI * 2); ctx.fill();

    // HUD
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffd6d6"; ctx.font = "bold 16px Sora, sans-serif";
    ctx.fillText(`${state.score}`, 16, 28);
    ctx.fillStyle = "rgba(255,214,214,.55)"; ctx.font = "12px Sora, sans-serif";
    ctx.fillText(`HI ${state.hiscore}`, 16, 46);

    // milestone popups
    ctx.textAlign = "center";
    for (const pp of state.popups) {
      ctx.globalAlpha = Math.max(0, 1 - pp.t / 70);
      ctx.fillStyle = "#ffe08a"; ctx.font = "bold 20px Sora, sans-serif";
      ctx.fillText(pp.text, W / 2, 70 - pp.t * 0.5);
    }
    ctx.globalAlpha = 1;

    if (state.phase === "idle") {
      ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.font = "bold 24px Sora, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("橋 JUMP", W / 2, H / 2 - 14);
      ctx.font = "14px Sora, sans-serif"; ctx.fillStyle = "#ffd6d6";
      ctx.fillText("tap / space to jump the 🧧", W / 2, H / 2 + 14);
    } else if (state.phase === "over") {
      ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.font = "bold 22px Sora, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("you dropped the 🧧", W / 2, H / 2 - 18);
      ctx.font = "16px Sora, sans-serif"; ctx.fillStyle = "#ffe08a";
      ctx.fillText(`score ${state.score}${state.score >= state.hiscore && state.score > 0 ? " — new high!" : ""}`, W / 2, H / 2 + 8);
      ctx.font = "13px Sora, sans-serif"; ctx.fillStyle = "#ffd6d6";
      ctx.fillText("tap to try again", W / 2, H / 2 + 32);
    }
  }

  function loop(t) {
    const dt = Math.min(2, (t - state.lastT) / 16.67 || 1); // normalized to 60fps, capped so a tab-switch doesn't teleport you into a 🧧
    state.lastT = t;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); jump(); });
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      // only hijack the key when the game is on screen, so it doesn't eat spacebar elsewhere on the page
      const r = canvas.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) { e.preventDefault(); jump(); }
    }
  });

  requestAnimationFrame(loop);
})();
