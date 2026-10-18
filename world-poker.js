// world-poker.js — ARCIA POKER LOUNGE, the Game Village's Texas Hold'em (loaded the first time the lounge door is used,
// like INFINITY RINGS). It draws its own scene through the stage's view() while the town waits, frozen, behind it:
// an oval felt table under a warm light, ARCIA dealing from behind it, cards and chips that slide and flip.
// Solo: you and 1–5 computer players (Beginner … Expert), 1,500 chips each, 12 hands, blinds rising every 4 hands —
// the game runs here with world-poker-engine.js. At the tables (a wallet): 2–6 people and computer players, dealt and
// timed by the server (api/_world-poker.mjs), which this page asks for the table about once a second.
// Blackjack against ARCIA plays at the same table (world-blackjack.js).
// Chips are play money: free every day, never bought with ARCL and never turned into ARCL. The lounge's only ARCL
// is its daily missions (finish 3 solo games · play 20 table hands · play 30 blackjack hands), which don't depend on winning.
//
// ctx: { THREE, K, st, ver, T, lang, esc, toast, Snd, reduce, low, coarse, sess, post, quality, name(), refresh(),
//        gain(n, why), onLeave() }
import { POKER, HANDS, LEVELS, newHand, act, legal, pot, botMove, best, equity, RANKS, SUITS, rankOf, suitOf } from "./world-poker-engine.js";
import { BJ } from "./world-blackjack-engine.js";
import { makeBlackjack } from "./world-blackjack.js";

const SAVE = "arc.world.poker", ROOMK = "arc.world.poker.room", fmt = (n) => Math.round(n || 0).toLocaleString("en-US");
const seoulDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const BOTS = ["AI ARON", "AI LUMI", "AI NEX", "AI ARC", "AI MINT"];
const AVC = ["#2f86ff", "#ff6fb5", "#2ee0b0", "#ffd23a", "#a77bff", "#ff8a3d"];
// the seats round the table, by where they're drawn: 0 is you (the bottom), then clockwise — the order of play
const SLOT = [90, 150, 210, 270, 330, 30], LAYOUT = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 2, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
const RX = 3.0, RZ = 3.9, CW = 0.62, CH = 0.87;
const BACKS = [{ id: "blue", lv: 1, a: "#1d4fd6", b: "#62a8ff", name: "Classic Blue" }, { id: "mint", lv: 5, a: "#0b7a63", b: "#5ff0d0", name: "Mint" }, { id: "gold", lv: 10, a: "#6b3f00", b: "#ffd23a", name: "Gold" }, { id: "inf", lv: 20, a: "#2a1260", b: "#b48cff", name: "Infinity" }];
const FELTS = [{ id: "violet", lv: 1, a: "#6a3cc0", b: "#1e0c44", name: "Lounge Violet" }, { id: "emerald", lv: 3, a: "#169a6e", b: "#04382a", name: "Emerald" }, { id: "navy", lv: 8, a: "#2a62c8", b: "#0a1a48", name: "Midnight Blue" }, { id: "crimson", lv: 15, a: "#b42a4c", b: "#3a0716", name: "Crimson" }];
const TITLES = [[1, "Rookie"], [5, "Regular"], [10, "Sharp Player"], [20, "High Roller"], [35, "Lounge Star"], [50, "ARCIA's Favorite"], [75, "Lounge Legend"], [100, "Infinity Ace"]];
const EMO = { ":gg:": "GG", ":nice:": "👍", ":wow:": "😮", ":lol:": "😂", ":gl:": "🍀", ":heart:": "💖" };
const PHRASES = ["Nice hand!", "Good luck!", "One more?"];
const EXAMPLES = [["A♠", "K♠", "Q♠", "J♠", "T♠"], ["9♥", "8♥", "7♥", "6♥", "5♥"], ["Q♠", "Q♥", "Q♦", "Q♣", "5♠"], ["K♠", "K♥", "K♦", "9♣", "9♠"], ["A♦", "J♦", "8♦", "6♦", "2♦"], ["T♣", "9♦", "8♠", "7♥", "6♣"], ["7♠", "7♥", "7♦", "K♣", "2♠"], ["J♠", "J♥", "4♦", "4♣", "A♠"], ["A♠", "A♥", "9♦", "6♣", "3♠"], ["A♣", "Q♦", "8♠", "5♥", "2♣"]];
/// the poker level from poker XP (the server's levelOf: 100 XP a level to 10, then 150 / 200 / 250 / 300)
export function levelOf(xp) { let lv = 1, need = 100, left = Math.max(0, xp | 0); while (lv < POKER.LEVELS) { need = lv <= 10 ? 100 : lv <= 25 ? 150 : lv <= 50 ? 200 : lv <= 75 ? 250 : 300; if (left < need) break; left -= need; lv++; } return { lv, into: left, need }; }
const rankTxt = (c) => (RANKS[rankOf(c)] === "T" ? "10" : RANKS[rankOf(c)]);
const isRed = (c) => suitOf(c) === 1 || suitOf(c) === 2;
const cc = (s) => SUITS.indexOf(s.slice(1)) * 13 + RANKS.indexOf(s[0]);
const cardHtml = (c, cls = "") => (c == null || c < 0 ? `<i class="pk-c bk ${cls}"></i>` : `<i class="pk-c${isRed(c) ? " r" : ""} ${cls}"><b>${rankTxt(c)}</b><u>${SUITS[suitOf(c)]}</u></i>`);

const LW = { ko: {}, zh: {}, tr: {} }; // (filled at the end of the file)

export function createPoker(ctx) {
  const { THREE, st, esc } = ctx, L0 = LW[ctx.lang] || {};
  const T = (s, v) => { const x = L0[s]; return x != null ? x.replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : "")) : ctx.T(s, v); };
  const snd = (k, ...a) => { try { const f = ctx.Snd && ctx.Snd[k]; if (f) f.call(ctx.Snd, ...a); } catch { /* silent */ } };
  const view = () => { const c = st.renderer.domElement, r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width || innerWidth, h: r.height || innerHeight }; };
  const phone = () => document.documentElement.classList.contains("wp-pcphone") || (innerWidth < 700 && innerHeight > innerWidth);
  const signed = () => !!(ctx.sess && ctx.sess());
  let on = false, busy = false, mode = "off", S = null, ui = null, prOrig = 0, tab = "play", fast = 1;
  let prog = load(), status = null, topB = null, roomsL = null, sayT = 0;
  let G = null, R = null, vis = blank(), Q = [], qAt = 0, latest = null, TWN = [], actBusy = false;

  // ---------------- this device's record (a wallet's comes from the server) ----------------
  function load() {
    const d = { xp: 0, day: "", xpToday: 0, games: 0, wins: 0, best: -1, back: "blue", felt: "violet", ais: 3, lvl: 1, hint: true, buzz: true };
    try { return { ...d, ...JSON.parse(localStorage.getItem(SAVE) || "{}") }; } catch { return d; }
  }
  function save() { try { localStorage.setItem(SAVE, JSON.stringify(prog)); } catch { /* kept for this visit */ } }
  const lvInfo = () => (status ? { lv: status.lv, into: status.into, need: status.need } : levelOf(prog.xp));
  const unlockLv = () => Math.max(lvInfo().lv, levelOf(prog.xp).lv);
  const titleOf = (lv) => TITLES.filter(([l]) => lv >= l).pop()[1];
  const meName = () => String((ctx.name && ctx.name()) || "").slice(0, 16) || T("You");

  // ---------------- the scene ----------------
  function canvasOf(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
  function texOf(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  function feltCanvas(kind = feltKind) {
    const f = FELTS.find((x) => x.id === prog.felt) || FELTS[0], n = ctx.low ? 512 : 1024, [c, g] = canvasOf(n, n);
    const gr = g.createRadialGradient(n / 2, n / 2, n * 0.04, n / 2, n / 2, n * 0.52); gr.addColorStop(0, f.a); gr.addColorStop(1, f.b); g.fillStyle = gr; g.fillRect(0, 0, n, n);
    const img = g.getImageData(0, 0, n, n), d = img.data; for (let i = 0; i < d.length; i += 4) { const k = (Math.random() - 0.5) * 12; d[i] += k; d[i + 1] += k; d[i + 2] += k; } g.putImageData(img, 0, 0);
    // the betting line, gold inside the rim (a circle on the canvas is the table's oval)
    g.strokeStyle = "rgba(255,214,130,.55)"; g.lineWidth = n * 0.006; g.beginPath(); g.arc(n / 2, n / 2, n * 0.37, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = "rgba(255,214,130,.22)"; g.lineWidth = n * 0.003; g.beginPath(); g.arc(n / 2, n / 2, n * 0.47, 0, Math.PI * 2); g.stroke();
    if (kind === "bj") { // blackjack's felt: the house rules across the middle, a betting spot before you
      g.save(); g.translate(n / 2, n * 0.5); g.scale(1, RX / RZ); g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "rgba(255,226,160,.42)";
      g.font = `900 ${Math.round(n * 0.05)}px sans-serif`; g.fillText("BLACKJACK PAYS 3 TO 2", 0, 0); g.font = `800 ${Math.round(n * 0.024)}px sans-serif`; g.fillStyle = "rgba(255,226,160,.3)";
      g.fillText("DEALER STANDS ON SOFT 17  ·  INSURANCE PAYS 2 TO 1", 0, n * 0.045); g.restore();
      return c;
    }
    // the lounge's name and the ∞, squeezed so they read round on the oval
    g.save(); g.translate(n / 2, n * 0.69); g.scale(1, RX / RZ); g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "rgba(255,226,160,.30)";
    g.font = `900 ${Math.round(n * 0.046)}px sans-serif`; g.fillText("ARCIA POKER LOUNGE", 0, 0); g.font = `900 ${Math.round(n * 0.085)}px sans-serif`; g.fillText("∞", 0, -n * 0.075); g.restore();
    return c;
  }
  let feltKind = "poker";
  function setFelt(kind) { if (!S || feltKind === kind) return; feltKind = kind; const old = S.feltM.map; S.feltM.map = texOf(feltCanvas()); S.feltM.needsUpdate = true; if (old) old.dispose(); }
  const cardTex = new Map();
  function faceTex(c) {
    const key = c < 0 ? "back:" + prog.back : c; if (cardTex.has(key)) return cardTex.get(key);
    const W = 200, H = 280, [cv, g] = canvasOf(W, H), rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    if (c < 0) {
      const b = BACKS.find((x) => x.id === prog.back) || BACKS[0];
      rr(2, 2, W - 4, H - 4, 22); g.fillStyle = "#fff"; g.fill();
      rr(12, 12, W - 24, H - 24, 14); const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, b.a); gr.addColorStop(1, b.b); g.fillStyle = gr; g.fill();
      g.save(); rr(12, 12, W - 24, H - 24, 14); g.clip(); g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 3; for (let k = -H; k < W + H; k += 22) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + H, H); g.stroke(); g.beginPath(); g.moveTo(k + H, 0); g.lineTo(k, H); g.stroke(); } g.restore();
      g.fillStyle = "rgba(255,255,255,.92)"; g.font = "900 96px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("∞", W / 2, H / 2 + 4);
    } else {
      rr(2, 2, W - 4, H - 4, 22); g.fillStyle = "#fffdf6"; g.fill(); g.strokeStyle = "#d9d2c0"; g.lineWidth = 3; g.stroke();
      const col = isRed(c) ? "#e0283c" : "#151a30", r = rankTxt(c), s = SUITS[suitOf(c)];
      g.fillStyle = col; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `900 ${r.length > 1 ? 70 : 82}px sans-serif`; g.fillText(r, 52, 58); g.font = "900 64px sans-serif"; g.fillText(s, 52, 128);
      g.font = "900 150px sans-serif"; g.fillText(s, W / 2 + 22, H / 2 + 62);
    }
    const t = texOf(cv); cardTex.set(key, t); return t;
  }
  function chipMats() {
    const cols = [0xf4f4f4, 0xe0283c, 0x1fa85a, 0x22222e, 0x8a4bff, 0xffc83a, 0x2fd0ff, 0xff7ab8];
    return cols.map((h) => {
      const hex = "#" + h.toString(16).padStart(6, "0"), [a, ga] = canvasOf(128, 16), [b, gb] = canvasOf(64, 64);
      ga.fillStyle = hex; ga.fillRect(0, 0, 128, 16); ga.fillStyle = h === 0xf4f4f4 ? "#2f86ff" : "#fff"; for (let k = 0; k < 6; k++) ga.fillRect(k * 21.3 + 4, 0, 9, 16);
      gb.fillStyle = hex; gb.fillRect(0, 0, 64, 64); gb.strokeStyle = h === 0xf4f4f4 ? "#2f86ff" : "#fff"; gb.lineWidth = 5; gb.setLineDash([7, 6]); gb.beginPath(); gb.arc(32, 32, 26, 0, Math.PI * 2); gb.stroke(); gb.setLineDash([]); gb.lineWidth = 2; gb.beginPath(); gb.arc(32, 32, 16, 0, Math.PI * 2); gb.stroke();
      const side = new THREE.MeshStandardMaterial({ map: texOf(a), roughness: 0.4, metalness: 0.05 }), top = new THREE.MeshStandardMaterial({ map: texOf(b), roughness: 0.35, metalness: 0.05 });
      return [side, top, top];
    });
  }
  const DENOM = [25000, 5000, 1000, 500, 100, 25, 5, 1], DCOL = [7, 6, 5, 4, 3, 2, 1, 0];
  function stackChips(g, amt) {
    while (g.children.length) g.remove(g.children[0]);
    if (!(amt > 0)) { g.visible = false; return; } g.visible = true;
    const list = []; let left = Math.round(amt);
    for (let k = 0; k < DENOM.length && list.length < 16; k++) while (left >= DENOM[k] && list.length < 16) { list.push(DCOL[k]); left -= DENOM[k]; }
    if (!list.length) list.push(0);
    list.forEach((ci, n) => { const m = new THREE.Mesh(S.chipGeo, S.chipM[ci]), col = Math.floor(n / 6), h = n % 6; m.position.set((col % 3) * 0.37 - (Math.min(2, Math.floor((list.length - 1) / 6)) * 0.185), 0.03 + h * 0.058, col >= 3 ? 0.34 : 0); m.rotation.y = (n * 1.7) % 6.28; g.add(m); });
  }
  function build() {
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200);
    try { // its own reflections: a dark room, a warm box light over the table, violet and blue at the sides
      const env = new THREE.Scene(); env.background = new THREE.Color(0x0a0618);
      const box = (c, k, x, y, z, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m); };
      box(0xffe2b0, 3.6, 0, 8, 0, 6, 6); box(0xa77bff, 2, -8, 2, 0, 3, 6); box(0x5aa8ff, 2, 8, 2, 0, 3, 6); box(0xffd080, 1.2, 0, 2, 9, 6, 3);
      const pm = new THREE.PMREMGenerator(st.renderer); scene.environment = pm.fromScene(env, 0.04).texture; pm.dispose();
    } catch { /* lit by the lights alone */ }
    const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "varying vec3 vP; void main(){ float h = vP.y * 0.5 + 0.5; vec3 c = mix(vec3(0.03, 0.02, 0.08), vec3(0.10, 0.05, 0.22), smoothstep(0.35, 0.8, h)); float g = pow(max(0.0, 1.0 - length(vP.xz - vec2(0.0, -0.6)) * 1.3), 3.0); c += vec3(0.30, 0.16, 0.55) * g * 0.35; gl_FragColor = vec4(c, 1.0); }" }));
    scene.add(sky);
    const [dc, dg] = canvasOf(64, 64), gr = dg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,.95)"); gr.addColorStop(0.45, "rgba(255,255,255,.3)"); gr.addColorStop(1, "rgba(255,255,255,0)"); dg.fillStyle = gr; dg.fillRect(0, 0, 64, 64);
    const dot = new THREE.CanvasTexture(dc);
    { // the lounge behind: out-of-focus lamps, gold and violet
      const n = ctx.low ? 22 : 54, p = new Float32Array(n * 3), c = new Float32Array(n * 3), cols = [0xffc861, 0xffa040, 0xb48cff, 0x5aa8ff].map((h) => new THREE.Color(h));
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 14; p[i * 3] = Math.cos(a) * r; p[i * 3 + 1] = 1 + Math.random() * 9; p[i * 3 + 2] = -Math.abs(Math.sin(a)) * r - 6; const k = cols[i % 4]; c.set([k.r, k.g, k.b], i * 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); g.setAttribute("color", new THREE.BufferAttribute(c, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2.6, map: dot, vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending })));
    }
    // the neon sign over the dealer
    { const [c, g] = canvasOf(1024, 256); g.textAlign = "center"; g.textBaseline = "middle"; g.font = "900 104px sans-serif"; g.shadowColor = "#b48cff"; g.shadowBlur = 34; g.fillStyle = "#f2e8ff"; g.fillText("ARCIA ♾️ POKER", 512, 96); g.font = "800 46px sans-serif"; g.shadowColor = "#ffc861"; g.fillStyle = "#ffe2a8"; g.fillText("— LOUNGE —", 512, 196);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: texOf(c), transparent: true, depthWrite: false, toneMapped: false })); m.position.set(0, 6.9, -RZ - 4.5); scene.add(m); S0.sign = m; }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ color: 0x150a2c, roughness: 0.55, metalness: 0.25 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.25; scene.add(floor);
    const shade = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ map: dot, color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false })); shade.rotation.x = -Math.PI / 2; shade.position.y = -1.23; shade.scale.set(RX * 1.6, RZ * 1.6, 1); scene.add(shade);
    scene.add(new THREE.HemisphereLight(0xd8c8ff, 0x1a0d30, 0.85));
    const spot = new THREE.SpotLight(0xfff0d8, 70, 30, 0.78, 0.65, 1.4); spot.position.set(0, 10, 1.2); spot.target.position.set(0, 0, 0.2); scene.add(spot, spot.target);
    const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(-3, 8, 6); scene.add(key);
    const rim = new THREE.DirectionalLight(0xa77bff, 0.9); rim.position.set(4, 3, -8); scene.add(rim);
    // the table: the felt oval, a padded rim with gold lines, the apron and the pedestal
    const tbl = new THREE.Group(); scene.add(tbl);
    const shp = new THREE.Shape(); shp.absellipse(0, 0, RX, RZ, 0, Math.PI * 2, false, 0);
    const fg = new THREE.ShapeGeometry(shp, 72), pa = fg.attributes.position, uv = new Float32Array(pa.count * 2);
    for (let i = 0; i < pa.count; i++) { uv[i * 2] = pa.getX(i) / (2 * RX) + 0.5; uv[i * 2 + 1] = pa.getY(i) / (2 * RZ) + 0.5; }
    fg.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); fg.rotateX(-Math.PI / 2);
    const feltM = new THREE.MeshStandardMaterial({ map: texOf(feltCanvas()), roughness: 0.95, metalness: 0 });
    tbl.add(new THREE.Mesh(fg, feltM));
    const loop = (rx, rz, y = 0) => new THREE.CatmullRomCurve3(Array.from({ length: 96 }, (_, k) => { const a = (k / 96) * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * rx, y, Math.sin(a) * rz); }), true);
    const pad = new THREE.Mesh(new THREE.TubeGeometry(loop(RX + 0.2, RZ + 0.2, 0.06), 192, 0.24, 14, true), new THREE.MeshStandardMaterial({ color: 0x24123f, roughness: 0.38, metalness: 0.1 })); tbl.add(pad);
    const goldM = new THREE.MeshStandardMaterial({ color: 0xe0b050, roughness: 0.22, metalness: 1 });
    tbl.add(new THREE.Mesh(new THREE.TubeGeometry(loop(RX - 0.02, RZ - 0.02, 0.03), 192, 0.035, 8, true), goldM));
    tbl.add(new THREE.Mesh(new THREE.TubeGeometry(loop(RX + 0.44, RZ + 0.44, -0.02), 192, 0.04, 8, true), goldM));
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.93, 0.62, 72, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a0c30, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide })); apron.scale.set(RX + 0.42, 1, RZ + 0.42); apron.position.y = -0.33; tbl.add(apron);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, 0.95, 32), new THREE.MeshStandardMaterial({ color: 0x120822, roughness: 0.4, metalness: 0.5 })); ped.position.y = -0.8; tbl.add(ped);
    // ARCIA, behind the far end of the table (her picture turns to face the camera, hinged at the waist), a glow behind her
    const deal = new THREE.Group(); deal.position.set(0, -0.15, -RZ - 0.75); scene.add(deal);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0x8a5cff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(6.5, 6.5, 1); halo.position.set(0, 2.2, -0.6); deal.add(halo);
    const dm = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.05, toneMapped: false, color: 0xf2eeff }); const dlr = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), dm); dlr.position.y = 2.1; deal.add(dlr); dlr.visible = false;
    new THREE.TextureLoader().loadAsync("images/world-arcia-dealer.webp?v=" + (ctx.ver || "1")).then((t) => { t.colorSpace = THREE.SRGBColorSpace; dm.map = t; dm.needsUpdate = true; dlr.visible = true; }).catch((e) => console.warn("poker dealer:", e));
    // her chip tray at the table's edge
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.42), new THREE.MeshStandardMaterial({ color: 0x0e0718, roughness: 0.3, metalness: 0.6 })); tray.position.set(0, 0.05, -RZ + 0.42); tbl.add(tray);
    const chipGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.055, 24), chipM = chipMats();
    for (let k = 0; k < 8; k++) for (let h = 0; h < 5; h++) { const m = new THREE.Mesh(chipGeo, chipM[[3, 5, 4, 2, 1, 6, 7, 0][k]]); m.rotation.z = Math.PI / 2; m.scale.setScalar(0.7); m.position.set(-0.84 + k * 0.24, 0.17, -RZ + 0.42 - 0.12 + h * 0.06); m.rotation.y = 0; tbl.add(m); }
    // the dealer button
    const [bc, bg] = canvasOf(256, 256); bg.fillStyle = "#fff"; bg.beginPath(); bg.arc(128, 128, 126, 0, Math.PI * 2); bg.fill(); bg.strokeStyle = "#ffc83a"; bg.lineWidth = 14; bg.beginPath(); bg.arc(128, 128, 112, 0, Math.PI * 2); bg.stroke();
    bg.fillStyle = "#151a30"; bg.font = "900 150px sans-serif"; bg.textAlign = "center"; bg.textBaseline = "middle"; bg.fillText("D", 128, 120); bg.font = "900 30px sans-serif"; bg.fillText("DEALER", 128, 206);
    const dbtn = new THREE.Group(), dEdge = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 32), new THREE.MeshStandardMaterial({ color: 0xe8e8f0, roughness: 0.4 })), dTop = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshStandardMaterial({ map: texOf(bc), roughness: 0.4 }));
    dEdge.position.y = 0.035; dTop.rotation.x = -Math.PI / 2; dTop.position.y = 0.072; dbtn.add(dEdge, dTop); dbtn.position.y = 0; dbtn.visible = false; scene.add(dbtn);
    // the cards: five for the board, two for each seat; a card is a pair of planes (face, back) laid on the felt
    const cg = new THREE.PlaneGeometry(CW, CH), cards = [];
    S0.cg = cg; S0.scene = scene; for (let k = 0; k < 17; k++) cards.push(newCard());
    const bets = Array.from({ length: 6 }, () => { const g = new THREE.Group(); g.visible = false; scene.add(g); return g; }), potG = new THREE.Group(); potG.position.set(0, 0.03, -1.3); scene.add(potG);
    const flyG = new THREE.Group(); scene.add(flyG);
    Object.assign(S0, { scene, cam, feltM, deal, dlr, halo, dbtn, cards, bets, potG, flyG, chipGeo, chipM, dot, ace: null, comp: null, p9: 0, key: "" });
    S = S0;
    const loader = ctx.K && ctx.K.gltfLoader ? ctx.K.gltfLoader() : null;
    if (loader) loader.loadAsync("models/world/poker/ace.glb?v=" + (ctx.ver || "1")).then((g) => {
      const o = g.scene, b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), k = 1.7 / Math.max(sz.x, sz.y, sz.z, 1e-3); o.scale.setScalar(k); o.position.sub(b.getCenter(new THREE.Vector3()).multiplyScalar(k));
      const w = new THREE.Group(); w.add(o); w.position.set(2.7, 1.3, -RZ - 0.2); w.visible = mode === "lobby"; o.traverse((m) => { if (m.isMesh && m.material) m.material.envMapIntensity = 1.3; }); scene.add(w); S.ace = w;
    }).catch((e) => console.warn("poker ace:", e));
  }
  const S0 = {};
  /// one more card for the pool (blackjack's splits can want more than poker's 17)
  function newCard() {
    const o = new THREE.Group(), lay = new THREE.Group(), flip = new THREE.Group(); lay.rotation.x = -Math.PI / 2; o.add(lay); lay.add(flip);
    const front = new THREE.Mesh(S0.cg, new THREE.MeshStandardMaterial({ map: faceTex(0), roughness: 0.45, alphaTest: 0.5, emissive: 0x000000 })), back = new THREE.Mesh(S0.cg, new THREE.MeshStandardMaterial({ map: faceTex(-1), roughness: 0.45, alphaTest: 0.5 }));
    back.rotation.y = Math.PI; flip.add(front, back); o.visible = false; S0.scene.add(o); return { o, flip, front, back, c: -2 };
  }
  /// a card's white: a touch darker under the desktop glow (bloom turned big white cards into plain light)
  const cardWhite = () => (S0.comp ? 0xcfcbc4 : 0xffffff);
  const cardAt = (k) => { while (S.cards.length <= k) S.cards.push(newCard()); return S.cards[k]; };

  // ---------------- the camera: the table fills the room between the top bar and your cards ----------------
  const tv = new THREE.Vector3();
  function frame() {
    if (!S) return; const V = view(), cam = S.cam, k = scaleK() * (V.h / innerHeight), lob = mode === "lobby" || mode === "result" || mode === "load";
    const top = (lob ? 30 : phone() ? 70 : 60) * k, bot = lob ? V.h * 0.6 : (phone() ? 200 : wide() ? 18 : 168) * k; // (wide: your cards and moves sit at the side)
    cam.aspect = V.w / V.h; cam.fov = phone() ? 40 : 34;
    const el = ((lob ? 26 : phone() ? 62 : 52) * Math.PI) / 180, tz = lob ? -RZ * 0.6 : 0.1;
    const pts = lob ? [[-(RX + 0.6), 0, -RZ * 0.4], [RX + 0.6, 0, -RZ * 0.4], [0, 4.3, -RZ - 0.75], [0, 0, -RZ * 0.1]] : [[-(RX + 0.5), 0, 0], [RX + 0.5, 0, 0], [0, 0, RZ + 0.5], [0, phone() ? 3.4 : 4.1, -RZ - 0.75], [0, 0, -RZ - 0.5]];
    const yT = 1 - (2 * top) / V.h, yB = -1 + (2 * bot) / V.h, band = Math.max(0.25, yT - yB);
    const place = (D) => { cam.position.set(0, D * Math.sin(el), tz + D * Math.cos(el)); cam.lookAt(0, lob ? 1.2 : 0, tz); cam.updateProjectionMatrix(); cam.updateMatrixWorld(); let x = 0, y0 = 9, y1 = -9; for (const p of pts) { tv.set(p[0], p[1], p[2]).project(cam); x = Math.max(x, Math.abs(tv.x)); y0 = Math.min(y0, tv.y); y1 = Math.max(y1, tv.y); } return { x, y0, y1 }; };
    let lo = 3, hi = 60; for (let it = 0; it < 22; it++) { const D = (lo + hi) / 2, r = place(D); if (r.x <= 0.97 && r.y1 - r.y0 <= band) hi = D; else lo = D; }
    const b = place(hi), s = (yT + yB) / 2 - (b.y0 + b.y1) / 2;
    cam.projectionMatrix.elements[9] = -s; cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert(); S.p9 = -s;
    S.key = [V.w, V.h, mode].join("x");
    S.dlr.parent.lookAt(cam.position.x, S.dlr.parent.position.y + (cam.position.y - S.dlr.parent.position.y) * 0.35, cam.position.z); // (leaning back a little toward the camera)
  }
  const wide = () => !phone() && innerWidth > innerHeight * 1.25;
  const boardScale = () => (phone() ? 1.08 : 1.3);
  const slotPos = (d, r) => { const a = (SLOT[d] * Math.PI) / 180; return { x: Math.cos(a) * RX * r, z: Math.sin(a) * RZ * r, a }; };
  function toScreen(x, y, z) { tv.set(x, y, z).project(S.cam); const V = view(), k = scaleK(); return { x: (V.x + ((tv.x + 1) / 2) * V.w) / k, y: (V.y + ((1 - tv.y) / 2) * V.h) / k, behind: tv.z > 1 }; }

  // ---------------- small motions ----------------
  const ease = (k) => 1 - Math.pow(1 - k, 3);
  function tween(dur, f, done, delay = 0) { TWN.push({ t: -delay * fast, dur: Math.max(0.01, dur * fast), f, done }); }
  /// a card to a place on the felt (yaw: its turn; up: face up), from where it is now
  function moveCard(cd, x, z, yaw, up, dur = 0.32, delay = 0, sc = 1, done) {
    let f0 = null;
    tween(dur, (k) => {
      if (!f0) { f0 = { x: cd.o.position.x, z: cd.o.position.z, y: cd.o.position.y, yaw: cd.o.rotation.y, fl: cd.flip.rotation.y, s: cd.o.scale.x }; cd.o.visible = true; }
      const e = ease(k); cd.o.position.set(f0.x + (x - f0.x) * e, 0.02 + Math.sin(k * Math.PI) * 0.35 + (f0.y - 0.02) * (1 - e), f0.z + (z - f0.z) * e);
      cd.o.rotation.y = f0.yaw + (yaw - f0.yaw) * e; cd.flip.rotation.y = f0.fl + ((up ? 0 : Math.PI) - f0.fl) * e; cd.o.scale.setScalar(f0.s + (sc - f0.s) * e);
    }, done, delay);
  }
  function cardFrom(cd, c) { cd.c = c; cd.front.material.map = faceTex(c < 0 ? 0 : c); cd.front.material.emissive.setHex(0); cd.front.material.color.setHex(cardWhite()); cd.front.material.needsUpdate = true; cd.back.material.map = faceTex(-1); cd.back.material.needsUpdate = true; cd.o.position.set(0, 0.5, -RZ + 0.6); cd.o.rotation.y = 0; cd.flip.rotation.y = Math.PI; cd.o.scale.setScalar(0.8); }
  function flyChips(from, to, amt, delay = 0) {
    if (!(amt > 0)) return; const g = new THREE.Group(); stackChips(g, Math.min(amt, 6000)); g.visible = true; S.flyG.add(g); g.position.set(from.x, 0.03, from.z);
    tween(0.42, (k) => { const e = ease(k); g.position.set(from.x + (to.x - from.x) * e, 0.03 + Math.sin(k * Math.PI) * 0.3, from.z + (to.z - from.z) * e); }, () => S.flyG.remove(g), delay);
  }

  // ---------------- the table as drawn: one queue of steps, so every move has its moment ----------------
  function blank() { return { M: null, handNo: 0, log: 0, board: 0, resulted: false, revealed: false, bet: [], tot: [], start: [], stack: [], eq: null, win: null, shown: {}, badge: {}, replay: null, turnSaid: 0, big: false }; }
  function step(wait, fn) { if (!Q.length && qAt < performance.now()) qAt = performance.now(); Q.push({ wait, fn }); }
  function runQ(now) {
    while (Q.length && now >= qAt) { const s = Q.shift(); try { s.fn(); } catch (e) { console.warn("poker step", e); } qAt = now + s.wait * 1000 * fast * (Q.length > 14 ? 0.25 : 1); }
    if (!Q.length && latest) { const m = latest; latest = null; apply(m); }
  }
  function sync(M) { if (Q.length) { latest = M; return; } apply(M); }
  const dispOf = (M, seat) => (seat - (M.me >= 0 ? M.me : 0) + 6) % 6;
  const dOfI = (M, i) => dispOf(M, M.hand.seatOf[i]);
  const mineI = (M) => (M.hand && M.hand.mine >= 0 ? M.hand.mine : -1);
  function apply(M) {
    vis.M = M; const H = M.hand;
    if (!H) { if (vis.handNo) { vis.handNo = 0; clearTable(); } paintAll(); return; }
    if (H.handNo !== vis.handNo || H.log.length < vis.log) newHandVis(M);
    const n = H.log.length - vis.log, quick = n > 8;
    const ro = runFrom(H);
    for (let k = vis.log; k < H.log.length; k++) { const e = H.log[k], kk = k, late = quick && k < H.log.length - 4; if (k === ro && !late) step(1.3, () => reveal(M)); step(late ? 0.04 : e.t === "street" ? (runFrom(H) >= 0 && kk >= runFrom(H) ? 1.5 : 0.62) : e.t === "sb" || e.t === "bb" ? 0.12 : 0.34, () => onLog(M, e, kk)); }
    vis.log = H.log.length;
    if (H.street >= 4 && H.result && !vis.resulted) {
      vis.resulted = true;
      // a run-out dealt with no log line (everyone all in before the flop): the rest of the board, slowly
      if (!H.result.uncontested) { const byLog = boardByLog(H); if (byLog < 5) { step(0.9, () => reveal(M)); for (const upto of [3, 4, 5]) if (upto > byLog) step(1.4, () => { collect(M); dealBoard(M, upto); showEq(M); }); } }
      step(3.4, () => onResult(M));
    }
    step(0, paintAll);
  }
  const boardByLog = (H) => { let n = 0; for (const e of H.log) if (e.t === "street") n = e.a; return n === 0 ? 0 : n === 1 ? 3 : n === 2 ? 4 : 5; };
  /// the log line from which the rest is only the board running out (everyone left is all in); -1 if none
  function runFrom(H) {
    if (!H.result || H.result.uncontested) return -1; let k = H.log.length - 1; while (k >= 0 && H.log[k].t === "street") k--;
    return k + 1 < H.log.length ? k + 1 : -1;
  }
  function newHandVis(M) {
    const H = M.hand; vis = { ...blank(), M, handNo: H.handNo, replay: vis.replay, turnSaid: vis.turnSaid };
    vis.bet = H.p.map(() => 0); vis.tot = H.p.map(() => 0);
    vis.start = H.p.map((p, i) => (H.result ? p.stack - H.result.net[i] : p.stack + p.total)); vis.stack = vis.start.slice();
    step(0.3, () => { clearTable(); snd("shuffle"); placeButton(M); if (H.handNo === 1 || Math.random() < 0.18) say(T(H.handNo === 1 ? "Let's play together~ ♡" : "Shuffle up and deal~")); });
    step(0.25 + 0.09 * H.p.filter((p) => !p.out).length * 2, () => dealHoles(M));
  }
  function clearTable() {
    if (!S) return; for (const cd of S.cards) { cd.o.visible = false; cd.c = -2; } for (const g of S.bets) stackChips(g, 0); stackChips(S.potG, 0); S.dbtn.visible = false;
    if (ui) { ui.mine.innerHTML = ""; ui.mine.className = "pk-mine"; ui.hname.textContent = ""; ui.eq.textContent = ""; ui.root.querySelectorAll(".pk-seat").forEach((e) => e.classList.remove("win", "fold", "allin", "lose")); }
    vis.badge = {}; vis.shown = {}; vis.eq = null; vis.win = null;
  }
  function placeButton(M) {
    const H = M.hand, d = dOfI(M, H.button), p = slotPos(d, 0.74), a = p.a + 0.32;
    S.dbtn.visible = true; const to = { x: Math.cos(a) * RX * 0.74, z: Math.sin(a) * RZ * 0.74 }, f = { x: S.dbtn.position.x, z: S.dbtn.position.z };
    tween(0.4, (k) => { const e = ease(k); S.dbtn.position.set(f.x + (to.x - f.x) * e, 0, f.z + (to.z - f.z) * e); });
  }
  const holeCard = (i, j) => S.cards[5 + i * 2 + j];
  function holeSpot(M, i, j) { const d = dOfI(M, i), p = slotPos(d, d === 0 ? 0.74 : 0.8), yaw = Math.PI / 2 - p.a, tx = -Math.sin(p.a), tz = Math.cos(p.a); return { x: p.x + tx * (j ? 0.2 : -0.2), z: p.z + tz * (j ? 0.2 : -0.2), yaw: yaw + (j ? -0.12 : 0.12) }; }
  function dealHoles(M) {
    const H = M.hand, me = mineI(M), order = []; let i = H.button;
    for (let r = 0; r < 2; r++) for (let k = 0; k < H.p.length; k++) { i = (i + 1) % H.p.length; if (!H.p[i].out) order.push([i, r]); }
    order.forEach(([i, j], n) => {
      if (i === me) { setTimeout(() => { if (!ui || vis.handNo !== H.handNo) return; ui.mine.insertAdjacentHTML("beforeend", cardHtml(H.p[i].hole[j], "big deal")); snd("card"); if (j === 1) paintMine(M); }, n * 90 * fast); return; }
      const cd = holeCard(i, j), sp = holeSpot(M, i, j); cardFrom(cd, H.p[i].hole[j]); moveCard(cd, sp.x, sp.z, sp.yaw, false, 0.3, n * 0.09, 0.78); setTimeout(() => snd("card"), n * 90 * fast);
    });
  }
  function dealBoard(M, upto) {
    const H = M.hand;
    for (let k = vis.board; k < Math.min(upto, H.board.length); k++) { const cd = S.cards[k], c = H.board[k], n = k - vis.board; cardFrom(cd, c); const bs = boardScale(); moveCard(cd, (k - 2) * (CW * bs + 0.08), 0.05, 0, true, 0.38, n * 0.16, bs); setTimeout(() => snd("flip"), n * 160 * fast); }
    vis.board = Math.max(vis.board, Math.min(upto, H.board.length)); paintMine(M);
  }
  function collect(M) {
    const H = M.hand; let any = false;
    vis.bet.forEach((b, i) => { if (b > 0) { any = true; const d = dOfI(M, i), p = slotPos(d, 0.6); flyChips(p, { x: 0, z: -1.3 }, b); stackChips(S.bets[d], 0); } vis.bet[i] = 0; });
    if (any) { snd("chip", 2); const hn = H.handNo; setTimeout(() => { if (vis.handNo === hn && !vis.win) stackChips(S.potG, vis.tot.reduce((a, b) => a + b, 0)); }, 420 * fast); }
    vis.badge = {}; for (let i = 0; i < H.p.length; i++) if (H.p[i].allin && !H.p[i].folded) vis.badge[i] = { t: T("ALL IN"), c: "allin" };
  }
  function onLog(M, e, k) {
    const H = M.hand, me = mineI(M), i = e.i;
    if (e.t === "street") {
      collect(M); if (runFrom(H) >= 0 && k >= runFrom(H) && !vis.revealed) reveal(M);
      dealBoard(M, e.a === 1 ? 3 : e.a === 2 ? 4 : 5); if (vis.revealed) showEq(M);
      paintAll(); return;
    }
    const d = dOfI(M, i), name = H.p[i].name;
    if (e.t === "fold") {
      vis.badge[i] = { t: T("FOLD"), c: "fold" }; snd("card");
      if (i === me) ui.mine.classList.add("folded");
      else for (let j = 0; j < 2; j++) { const cd = holeCard(i, j); if (cd.o.visible) moveCard(cd, (j - 0.5) * 0.3, -RZ * 0.42, 0.4 * (j - 0.5), false, 0.35, j * 0.05, 0.6, () => { cd.o.visible = false; }); }
    } else if (e.t === "check") { vis.badge[i] = { t: T("CHECK"), c: "check" }; snd("knock"); }
    else {
      const was = vis.bet[i], add = Math.max(0, e.a - was); vis.bet[i] = e.a; vis.tot[i] += add; vis.stack[i] = vis.start[i] - vis.tot[i];
      const opened = H.log.slice(0, k).some((x) => x.st === e.st && x.i >= 0 && (x.t === "sb" || x.t === "bb" || x.t === "raise" || x.t === "allin"));
      const lbl = e.t === "sb" ? T("SB") : e.t === "bb" ? T("BB") : e.t === "call" ? T("CALL") : e.t === "allin" ? T("ALL IN") : opened ? T("RAISE") : T("BET");
      vis.badge[i] = { t: lbl + (e.t === "sb" || e.t === "bb" ? "" : " " + fmt(e.a)), c: e.t === "allin" ? "allin" : e.t === "call" ? "call" : e.t === "sb" || e.t === "bb" ? "blind" : "raise" };
      const sp = slotPos(d, 0.92), to = slotPos(d, 0.6); if (add > 0) flyChips(sp, to, add); setTimeout(() => { if (vis.handNo === H.handNo) stackChips(S.bets[d], vis.bet[i]); }, 400 * fast);
      snd("chip", e.t === "raise" || e.t === "allin" ? 3 : 1);
      if (e.t === "allin" && i !== me) flash(T("{name}: ALL IN!", { name }), "allin");
      if (!vis.big && vis.tot.reduce((a, b) => a + b, 0) >= H.bb * 60) { vis.big = true; flash(T("BIG POT!"), "big"); say(T("Big pot~! ♡")); }
    }
    paintAll();
  }
  /// everyone still in shows their cards (an all-in run-out, or the showdown)
  function reveal(M) {
    const H = M.hand, me = mineI(M); if (!H.result || vis.revealed) return; vis.revealed = true;
    for (const sh of H.result.shown) { if (sh.i === me) continue; for (let j = 0; j < 2; j++) { const cd = holeCard(sh.i, j), sp = holeSpot(M, sh.i, j); cd.c = sh.hole[j]; cd.front.material.map = faceTex(sh.hole[j]); cd.front.material.needsUpdate = true; cd.o.visible = true; moveCard(cd, sp.x, sp.z, sp.yaw, true, 0.4, j * 0.12, 0.92); } }
    snd("flip"); if (runFrom(H) >= 0 || boardByLog(H) < 5) { flash(T("ALL IN — the board runs out"), "allin"); say(T("All in! Here comes the board~")); showEq(M); }
  }
  function showEq(M) { const H = M.hand; if (!H.result) return; const sh = H.result.shown, board = H.board.slice(0, vis.board); vis.eq = {}; const e = eqKnown(sh.map((x) => x.hole), board, ctx.low ? 220 : 400); sh.forEach((x, k) => { vis.eq[x.i] = e[k]; }); paintAll(); }
  function eqKnown(holes, board, n) {
    const used = new Set([...holes.flat(), ...board]), rest = []; for (let c = 0; c < 52; c++) if (!used.has(c)) rest.push(c);
    const need = 5 - board.length, win = holes.map(() => 0); let runs = 0;
    const score = (bd) => { const v = holes.map((h) => best([...h, ...bd]).v), top = Math.max(...v), w = v.filter((x) => x === top).length; v.forEach((x, k) => { if (x === top) win[k] += 1 / w; }); runs++; };
    if (need === 0) score(board); else if (need === 1) for (const c of rest) score([...board, c]);
    else for (let k = 0; k < n; k++) { const d = rest.slice(); for (let i = 0; i < need; i++) { const j = i + Math.floor(Math.random() * (d.length - i)); const t = d[i]; d[i] = d[j]; d[j] = t; } score([...board, ...d.slice(0, need)]); }
    return win.map((w) => w / Math.max(1, runs));
  }
  function onResult(M) {
    const H = M.hand, res = H.result, me = mineI(M); if (!res) return;
    collect(M); if (!res.uncontested) { reveal(M); dealBoard(M, 5); }
    vis.eq = null; vis.badge = {};
    const won = H.p.map((p, i) => res.net[i] + vis.tot[i]), potAll = vis.tot.reduce((a, b) => a + b, 0);
    stackChips(S.potG, 0);
    won.forEach((w, i) => { if (w > 0) { flyChips({ x: 0, z: -1.3 }, slotPos(dOfI(M, i), 0.9), w, 0.1); vis.badge[i] = { t: "+" + fmt(w), c: "win" }; } });
    // the pot counts down as the winners' stacks count up
    const from = vis.stack.slice(), to = H.p.map((p) => p.stack); vis.potLeft = potAll;
    tween(0.95, (k) => { const e = ease(k); vis.potLeft = Math.round(potAll * (1 - e)); vis.stack = from.map((f, i) => Math.round(f + (to[i] - f) * e)); paintSeats(); }, () => { vis.stack = to.slice(); vis.potLeft = 0; paintSeats(); }, 0.25);
    vis.win = new Set(won.map((w, i) => (w > 0 ? i : -1)).filter((i) => i >= 0));
    for (const sh of res.shown) vis.shown[sh.i] = T(sh.name);
    // the winning five, lifted and lit
    const top = res.pots[0] && res.shown.find((x) => x.i === res.pots[0].win[0]);
    if (top && !res.uncontested) {
      const five = new Set(top.five);
      // (the rest of the board and the losers' cards go dim, so the winning five stand out)
      for (let k = 0; k < 5; k++) { const cd = S.cards[k]; if (five.has(cd.c)) { cd.front.material.emissive.setHex(0x1c1200); tween(0.25, (q) => { cd.o.position.y = 0.02 + q * 0.14; }); } else cd.front.material.color.setHex(0x5a5a6e); }
      for (const sh of res.shown) for (let j = 0; j < 2; j++) if (sh.i !== me) { const m = holeCard(sh.i, j).front.material; if (five.has(sh.hole[j]) && vis.win.has(sh.i)) m.emissive.setHex(0x1c1200); else m.color.setHex(0x5a5a6e); }
      if (me >= 0) ui.mine.querySelectorAll(".pk-c").forEach((el, j) => el.classList.toggle("dim", !(vis.win.has(me) && five.has(H.p[me].hole[j]))));
      if (me >= 0 && vis.win.has(me)) ui.mine.querySelectorAll(".pk-c").forEach((el, j) => el.classList.toggle("hot", five.has(H.p[me].hole[j])));
    }
    snd("chip", 4);
    const iWon = me >= 0 && vis.win.has(me), wName = H.p[[...vis.win][0]] ? H.p[[...vis.win][0]].name : "", hand = top && !res.uncontested ? T(top.name) : "";
    if (top && top.cat === 9 && !res.uncontested) { banner(`<b>${esc(T("ARCIA JACKPOT!"))}</b><small>${esc(T("ROYAL FLUSH"))} · ${esc(wName)}</small>`, "jackpot"); confetti(60); say(T("A royal flush?! ARCIA JACKPOT! 💙💚")); snd("level"); }
    else if (iWon) { banner(`<b>${esc(vis.win.size > 1 ? T("SPLIT POT") : T("YOU WIN"))} +${fmt(won[me])}</b>${hand ? `<small>${esc(hand)}</small>` : ""}`, "win"); confetti(potAll >= H.bb * 40 ? 40 : 18); snd("win"); buzz(potAll >= H.bb * 40 ? [40, 50, 90] : [35]);
      say(vis.start[me] < (G ? POKER.START : 0) * 0.4 || vis.start[me] < H.bb * 15 ? T("What a comeback! ♾️") : T("Nice hand~ ♡")); }
    else banner(`<b>${esc(T("{name} wins", { name: wName }))}${vis.win.size > 1 ? " · " + esc(T("SPLIT POT")) : ""}</b><small>${esc(hand || T("Everyone else folded"))}</small>`, "lose");
    if (me >= 0 && !iWon && res.shown.some((x) => x.i === me)) ui.root.querySelector('.pk-seat[data-d="0"]').classList.add("lose");
    // what the hand was, for the replay
    vis.replay = { handNo: H.handNo, sb: H.sb, bb: H.bb, board: H.board.slice(), log: H.log.slice(), names: H.p.map((p) => p.name), mine: me >= 0 ? H.p[me].hole.slice() : null, me, result: res, alive0: H.p.map((p) => !p.out) };
    if (G && me >= 0 && iWon && top && !res.uncontested && top.i === me) G.best = Math.max(G.best, top.cat);
    paintAll(); ui.replayB.disabled = false;
  }

  // ---------------- the HUD over the table ----------------
  function paintAll() { if (!ui || !vis.M) return; paintSeats(); paintMine(vis.M); paintBar(); paintWait(); paintTop(); }
  function paintSeats() {
    if (mode !== "table") return; // (a count-up finishing under the game-over sheet)
    const M = vis.M, H = M.hand, me0 = M.me >= 0 ? M.me : 0, mp = M.kind === "mp";
    for (let d = 0; d < 6; d++) {
      const el = ui.seats[d], seat = M.seats[(d + me0) % 6], si = (d + me0) % 6, i = H ? H.seatOf.indexOf(si) : -1;
      if (!seat) { el.hidden = !(mp && d !== 0 && !(H && H.street < 4)); el.className = "pk-seat empty"; el.dataset.d = d; el.querySelector(".nm").textContent = T("Open seat"); el.querySelector(".sk").textContent = ""; el.querySelector(".pk-av span").textContent = "+"; el.querySelector(".pk-act").hidden = true; el.querySelector(".pk-shown").hidden = true; el.style.setProperty("--c", "#4a3a7a"); continue; }
      el.hidden = false; el.dataset.d = d;
      const p = i >= 0 ? H.p[i] : null, stk = i >= 0 && vis.stack[i] != null ? vis.stack[i] : seat.stack;
      el.classList.toggle("empty", false); el.classList.toggle("me", d === 0 && M.me >= 0);
      el.classList.toggle("fold", !!(p && p.folded)); el.classList.toggle("out", !p || p.out); el.classList.toggle("allin", !!(p && p.allin && !p.folded));
      el.classList.toggle("win", !!(vis.win && vis.win.has(i))); el.classList.toggle("away", !!(seat.away || seat.sit));
      el.style.setProperty("--c", AVC[si % AVC.length]);
      el.querySelector(".nm").textContent = seat.name || "";
      el.querySelector(".sk").textContent = fmt(stk);
      el.querySelector(".pk-av span").textContent = seat.bot ? "🤖" : (seat.name || "?").replace(/^AI /, "").slice(0, 1).toUpperCase();
      const b = i >= 0 ? vis.badge[i] : null, ab = el.querySelector(".pk-act"); ab.hidden = !b; if (b) { ab.textContent = b.t; ab.className = "pk-act " + b.c; }
      const sh = el.querySelector(".pk-shown"), eq = vis.eq && i >= 0 && vis.eq[i] != null ? Math.round(vis.eq[i] * 100) + "%" : ""; const txt = eq || (i >= 0 && vis.shown[i]) || ""; sh.hidden = !txt; sh.textContent = txt; sh.classList.toggle("eq", !!eq);
      el.querySelector(".lv").textContent = seat.bot ? T(LEVELS[seat.lvl || 0]) : seat.away ? T("Away") : seat.sit ? T("Sitting out") : "";
    }
  }
  function paintMine(M) {
    const H = M.hand, me = mineI(M); if (!H || me < 0) { ui.hname.textContent = ""; return; }
    const hole = H.p[me].hole, board = H.board.slice(0, vis.board);
    let nm = ""; if (hole.length === 2 && hole[0] >= 0) { if (board.length >= 3) nm = T(best([...hole, ...board]).name); else if (rankOf(hole[0]) === rankOf(hole[1])) nm = T("One Pair"); }
    ui.hname.textContent = H.p[me].folded ? T("Folded") : nm;
    ui.eq.textContent = vis.eq && vis.eq[me] != null ? Math.round(vis.eq[me] * 100) + "%" : "";
    // the hint: how often these cards win against the hands still in (random ones), worked out once a street
    const live = H.p.filter((p, i) => i !== me && !p.folded && !p.out).length, showStr = prog.hint && H.street < 4 && !H.p[me].folded && hole[0] >= 0 && live > 0 && !vis.eq;
    ui.str.hidden = !showStr || vis.str == null;
    if (showStr) {
      const key = H.handNo + ":" + board.length + ":" + live;
      if (vis.strKey !== key) { vis.strKey = key; vis.str = null; ui.str.hidden = true; setTimeout(() => { if (vis.strKey !== key || !ui) return; try { vis.str = equity(hole, board, live, ctx.low ? 120 : 220, Math.random); } catch { vis.str = null; } if (vis.M) paintMine(vis.M); }, 30); }
      else if (vis.str != null) { const e = vis.str, c = e >= 0.6 ? "hi" : e >= 0.35 ? "mid" : "lo"; ui.str.className = "pk-str " + c; ui.str.querySelector("i").style.width = Math.round(e * 100) + "%"; ui.str.querySelector("b").textContent = T(c === "hi" ? "Strong" : c === "mid" ? "Good" : "Weak") + " · ≈" + Math.round(e * 100) + "%"; }
    }
  }
  const myTurn = (M) => { const H = M && M.hand; return !!(H && H.street < 4 && H.mine >= 0 && H.toAct === H.mine && !Q.length && !latest); };
  function paintBar() {
    const M = vis.M, turn = mode === "table" && myTurn(M) && !actBusy;
    ui.bar.hidden = !turn; if (!turn) { ui.raise.hidden = true; return; }
    const H = M.hand, L = legal(H), P0 = pot(H);
    ui.b.fold.hidden = L.check; ui.b.call.innerHTML = L.check ? `<b>${esc(T("CHECK"))}</b>` : `<b>${esc(T("CALL"))}</b><small>${fmt(L.toCall)}</small>`;
    ui.b.call.classList.toggle("allin", !L.check && L.toCall >= H.p[H.mine].stack);
    ui.b.raise.hidden = !L.raise; ui.b.raise.innerHTML = `<b>${esc(H.curBet > 0 ? T("RAISE") : T("BET"))}</b>`;
    ui.b.allin.hidden = !L.allin || (!L.check && L.toCall >= H.p[H.mine].stack);
    if (L.raise) { const r = ui.raise.querySelector("input"); r.min = L.raise.min; r.max = L.raise.max; r.step = Math.max(1, H.bb / 2); if (!(+r.value >= L.raise.min && +r.value <= L.raise.max)) r.value = L.raise.min; paintRaise(); }
    if (vis.turnSaid !== H.handNo && (vis.turnSaid === 0 || H.handNo % 5 === 0)) { vis.turnSaid = H.handNo; say(T("Your turn~ Call, raise or fold? ♡")); }
    void P0;
  }
  function paintRaise() {
    const M = vis.M, H = M && M.hand; if (!H || H.street >= 4) return; const r = ui.raise.querySelector("input"), v = Math.round(+r.value), all = v >= +r.max;
    ui.raise.querySelector(".amt").textContent = fmt(v); ui.raise.querySelector('[data-a="raiseGo"]').innerHTML = `<b>${esc(all ? T("ALL IN") : H.curBet > 0 ? T("RAISE TO") : T("BET"))}</b><small>${fmt(v)}</small>`;
  }
  function paintWait() {
    const M = vis.M, mp = M && M.kind === "mp", H = M && M.hand; let t = "";
    if (mode === "table" && mp) {
      const n = M.seats.filter(Boolean).length;
      if (M.me < 0) t = R && R.watch ? T("Watching · tap Sit down to play") : T("You're out of chips at this table");
      else if (!H) t = n < 2 ? T("Waiting for players… ({n}/6)", { n }) : T("The next hand starts soon…");
      else if (H.mine < 0) t = T("You're in from the next hand");
    }
    ui.wait.hidden = !t; ui.wait.querySelector("span").textContent = t;
    ui.tools.hidden = !(mode === "table" && mp);
    if (mp && M) { ui.tools.querySelector('[data-a="bot"]').hidden = M.me < 0 || M.seats.filter(Boolean).length >= 6; ui.tools.querySelector('[data-a="sit"]').hidden = M.me >= 0 || M.seats.filter(Boolean).length >= 6; ui.tools.querySelector('[data-a="chat"]').hidden = M.me < 0; }
  }
  function paintTop() {
    const M = vis.M, H = M && M.hand; if (!M) return;
    ui.title.textContent = M.kind === "mp" ? (M.priv ? T("Private table") : T("Table")) + " · " + fmt(M.stake.sb) + "/" + fmt(M.stake.bb) : T("Solo · {lvl}", { lvl: T(LEVELS[G ? G.lvl : 0]) });
    ui.sub.textContent = M.kind === "mp" ? (M.priv && M.code ? T("Code {c}", { c: M.code }) : T("Hand #{n}", { n: H ? H.handNo : "–" })) : T("Hand {n} / {m} · Blinds {b}", { n: G ? G.hands : 0, m: POKER.SOLO_HANDS, b: H ? fmt(H.sb) + "/" + fmt(H.bb) : "" });
  }
  // the seat labels, the pot, the bets and ARCIA's words follow the table on screen; the clock of whoever's turn it is
  function place() {
    if (!ui || !S || !vis.M) return; const M = vis.M, H = M.hand, W = innerWidth / scaleK();
    for (let d = 0; d < 6; d++) {
      const el = ui.seats[d]; if (el.hidden) continue;
      if (d === 0) { el.style.transform = ""; continue; } // (yours sits with your cards)
      const p = slotPos(d, d === 3 ? 1.02 : 1.14), s = toScreen(p.x, 0.1, p.z), x = Math.max(58, Math.min(W - 58, s.x));
      el.style.transform = `translate(${x}px, ${s.y}px) translate(-50%, -50%)`;
    }
    const pt = H ? (vis.win ? vis.potLeft || 0 : vis.tot.reduce((a, b) => a + b, 0)) : 0; ui.pot.hidden = !pt; if (pt) { const s = toScreen(0, 0.2, -1.3); ui.pot.style.transform = `translate(${s.x}px, ${s.y}px) translate(-118%, -50%)`; /* (beside the pot's chips: above them is the far seat's bet) */ ui.potV.textContent = fmt(pt); }
    for (let d = 0; d < 6; d++) { const el = ui.betL[d], seatI = H ? H.seatOf.indexOf((d + (M.me >= 0 ? M.me : 0)) % 6) : -1, b = seatI >= 0 ? vis.bet[seatI] : 0; el.hidden = !(b > 0); if (b > 0) { const p = slotPos(d, 0.6), s = toScreen(p.x, 0.1, p.z); el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, 40%)`; el.textContent = fmt(b); } }
    if (!ui.arcia.hidden) { const s = toScreen(1.1, 3.55, -RZ - 0.75); ui.arcia.style.transform = `translate(${Math.min(W - 120, s.x)}px, ${Math.max(70, s.y)}px)`; }
    // the clock
    const ti = H && H.street < 4 && !Q.length ? H.toAct : -1;
    for (let d = 0; d < 6; d++) ui.seats[d].classList.remove("turn");
    if (ti >= 0) {
      const d = dOfI(M, ti), el = ui.seats[d]; el.classList.add("turn");
      let f = 1; if (M.kind === "mp" && M.deadline) f = Math.max(0, Math.min(1, (M.deadline - Date.now()) / (POKER.TURN_S * 1000))); else if (G && G.botAt && ti !== H.mine) f = Math.max(0, (G.botAt - performance.now()) / 1400);
      el.style.setProperty("--t", f.toFixed(3));
      if (M.kind === "mp" && ti === H.mine && f < 0.3 && !vis.warned) { vis.warned = true; snd("tap"); }
    }
  }
  function say(t, ms = 2800) { if (!ui) return; ui.arcia.textContent = t; ui.arcia.hidden = false; ui.arcia.classList.remove("go"); void ui.arcia.offsetWidth; ui.arcia.classList.add("go"); clearTimeout(sayT); sayT = setTimeout(() => { if (ui) ui.arcia.hidden = true; }, ms * Math.max(0.3, fast)); }
  function flash(t, c = "") { const el = document.createElement("div"); el.className = "pk-flash " + c; el.textContent = t; ui.root.appendChild(el); setTimeout(() => el.remove(), 1700); }
  function banner(html, c) { ui.banner.innerHTML = html; ui.banner.className = "pk-banner " + c; ui.banner.hidden = false; void ui.banner.offsetWidth; ui.banner.classList.add("go"); clearTimeout(ui.bannerT); ui.bannerT = setTimeout(() => { if (ui) ui.banner.hidden = true; }, 2900 * Math.max(0.3, fast)); }
  function buzz(p) { if (!prog.buzz || !ctx.coarse) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* no vibration here */ } }
  function confetti(n) { if (ctx.reduce || !ui) return; const cols = ["#ffd23a", "#5ff0d0", "#b48cff", "#ff6fb5", "#62a8ff"]; for (let k = 0; k < n; k++) { const el = document.createElement("i"); el.className = "pk-conf"; el.style.left = Math.random() * 100 + "%"; el.style.background = cols[k % cols.length]; el.style.animationDelay = Math.random() * 0.5 + "s"; el.style.setProperty("--dx", (Math.random() - 0.5) * 140 + "px"); ui.root.appendChild(el); setTimeout(() => el.remove(), 2600); } }

  // ---------------- your moves ----------------
  async function move(a) {
    const M = vis.M; if (!myTurn(M) || actBusy) return;
    ui.raise.hidden = true;
    if (M.kind === "solo") { if (!act(G.hand, G.hand.mine, a)) { flash(T("That move isn't allowed")); snd("bad"); return; } sync(soloModel()); return; }
    actBusy = true; paintBar();
    try { const j = await api({ action: "world-poker-act", room: R.id, t: a.t, to: a.to }); syncRoom(j.room); }
    catch (e) { ctx.toast(T("That move didn't go through: {e}", { e: esc(errText(e)) })); }
    finally { actBusy = false; paintBar(); }
  }
  function allinAsk() {
    modal(`<p class="pk-say">${esc(T("Are you sure? ♡ Go all in~?"))}</p><div class="pk-row"><button type="button" class="pk-btn" data-a="close">${esc(T("Cancel"))}</button><button type="button" class="pk-btn hot" data-a="allinGo">${esc(T("ALL IN"))}</button></div>`, true);
  }
  function modal(html, arcia = false) { ui.modal.innerHTML = `<div class="pk-card${arcia ? " arcia" : ""}">${arcia ? '<i class="pk-face"></i>' : ""}${html}</div>`; ui.modal.hidden = false; }
  const closeModal = () => { if (ui) ui.modal.hidden = true; };

  // ---------------- solo: you and the computer players, here in the browser ----------------
  function soloStart() {
    const n = Math.max(1, Math.min(5, prog.ais | 0)), lvl = Math.max(0, Math.min(3, prog.lvl | 0)), slots = LAYOUT[n + 1], seats = Array(6).fill(null);
    slots.forEach((s, k) => { seats[s] = k === 0 ? { name: meName(), stack: POKER.START, bot: false } : { name: BOTS[k - 1], stack: POKER.START, bot: true, lvl }; });
    G = { n, lvl, slots, seats, hands: 0, button: slots[Math.floor(Math.random() * slots.length)], best: -1, botAt: 0, nextAt: 0, runP: null, at: Date.now(), over: false };
    const ss = ctx.sess && ctx.sess();
    G.runP = ss && ctx.post ? ctx.post({ action: "world-poker-solo-start", ...ss, lvl }).then((r) => (r && r.ok && r.j && r.j.runId ? r.j.runId : null)).catch(() => null) : Promise.resolve(null);
    R = null; toTable(); vis = blank(); soloDeal();
  }
  function soloModel() { return { kind: "solo", seats: G.seats, me: 0, hand: G.hand, deadline: 0, stake: { sb: G.hand ? G.hand.sb : 10, bb: G.hand ? G.hand.bb : 20 } }; }
  function soloDeal() {
    const ready = G.slots.filter((s) => G.seats[s].stack > 0);
    // out of chips with hands still to play: one rebuy a game, if you like
    if (G.seats[0].stack <= 0 && !G.rebuy && G.hands < POKER.SOLO_HANDS && ready.length >= 1) { G.asking = true; modal(`<p class="pk-say">${esc(T("Out of chips~ ♡ One more go?"))}</p><p>${esc(T("Rebuy {n} chips (once a game)", { n: fmt(POKER.START) }))}</p><div class="pk-row"><button type="button" class="pk-btn" data-a="endGame">${esc(T("End the game"))}</button><button type="button" class="pk-btn go" data-a="rebuy">${esc(T("Rebuy"))}</button></div>`, true); return; }
    if (G.seats[0].stack <= 0 || ready.length < 2 || G.hands >= POKER.SOLO_HANDS) return soloOver();
    let b = G.button; for (let k = 1; k <= 6; k++) { const j = (G.button + k) % 6; if (ready.includes(j)) { b = j; break; } } G.button = b;
    const lv = Math.floor(G.hands / 4), sb = 10 * 2 ** lv, bb = sb * 2;
    const H = newHand({ players: ready.map((s) => ({ id: "s" + s, name: G.seats[s].name, stack: G.seats[s].stack, bot: G.seats[s].bot, lvl: G.seats[s].lvl })), button: ready.indexOf(b), sb, bb, seed: (Math.random() * 2 ** 31) | 0, handNo: ++G.hands });
    H.seatOf = ready; H.mine = ready.indexOf(0); G.hand = H; G.botAt = 0; G.nextAt = 0;
    if (G.hands > 1 && G.hands % 4 === 1) flash(T("Blinds up: {b}", { b: fmt(sb) + "/" + fmt(bb) }), "big");
    sync(soloModel());
  }
  function soloTick(now) {
    if (!G || G.over || G.asking || mode !== "table" || Q.length || latest) return; const H = G.hand; if (!H) return;
    if (H.street < 4) {
      if (H.toAct < 0 || H.toAct === H.mine) return;
      if (!G.botAt) { G.botAt = now + (800 + Math.random() * 600) * fast; return; }
      if (now < G.botAt) return;
      G.botAt = 0; const m = botMove(H, Math.random); if (!act(H, H.toAct, m || { t: "fold" })) act(H, H.toAct, { t: "fold" }); sync(soloModel()); return;
    }
    if (!vis.resulted) return;
    if (!G.nextAt) { G.nextAt = now + 900 * fast; return; }
    if (now < G.nextAt) return;
    H.p.forEach((p, k) => { G.seats[H.seatOf[k]].stack = p.stack; }); G.nextAt = 0; soloDeal();
  }
  async function soloOver() {
    if (!G || G.over) return; G.over = true; mode = "result"; hideTable(); frame();
    const order = G.slots.map((s) => ({ s, ...G.seats[s] })).sort((a, b) => b.stack - a.stack), place = order.findIndex((x) => x.s === 0) + 1, mine = G.seats[0].stack, won = place === 1 && mine > 0, spent = POKER.START * (1 + (G.rebuy || 0));
    const lv0 = levelOf(prog.xp).lv, day = seoulDay();
    if (prog.day !== day) { prog.day = day; prog.xpToday = 0; }
    const xpG = Math.max(0, Math.min(POKER.XP_GAME, POKER.XP_DAY - prog.xpToday)); prog.xp += xpG; prog.xpToday += xpG; prog.games++; if (won) prog.wins++; if (G.best > prog.best) prog.best = G.best; save();
    if (ctx.gain) try { ctx.gain(25, "poker"); } catch { /* the game still counts */ }
    sheet(`<div class="pk-res"><h2>${esc(won ? T("YOU WIN THE GAME!") : T("GAME OVER"))}</h2><p class="pk-say">${esc(won ? T("What a game~ You're a natural! ♡") : T("Good game~ ♡ One more?"))}</p>
      <ol class="pk-places">${order.map((x, k) => `<li class="${x.s === 0 ? "me" : ""}"><i>${k + 1}</i><b>${esc(x.name)}</b><span>${fmt(x.stack)}</span></li>`).join("")}</ol>
      <div class="pk-stats"><span>${esc(T("Hands"))} <b>${G.hands}</b></span><span>${esc(T("Chips"))} <b class="${mine >= spent ? "up" : "down"}">${mine >= spent ? "+" : ""}${fmt(mine - spent)}</b></span>${G.rebuy ? `<span>${esc(T("Rebuy used"))}</span>` : ""}<span>${esc(T("Best hand"))} <b>${G.best >= 0 ? esc(T(HANDS[G.best])) : "–"}</b></span></div>
      <div class="pk-pay" data-pay>${signed() ? esc(T("Sending your game…")) : esc(T("Guest play: sign in to count missions and earn ARCL"))}</div>
      <div class="pk-row"><button type="button" class="pk-btn" data-a="lobby">${esc(T("Lounge"))}</button><button type="button" class="pk-btn go" data-a="again">${esc(T("Play again"))}</button></div></div>`);
    snd(won ? "level" : "close");
    const box = ui.sheet.querySelector("[data-pay]"), runId = await G.runP;
    if (!signed() || !runId) { if (signed() && box) box.textContent = T("This game couldn't be counted — try again later"); levelUp(lv0); return; }
    let r = null; try { r = await ctx.post({ action: "world-poker-solo-end", ...ctx.sess(), runId, hands: G.hands, won, best: G.best }); } catch { r = null; }
    if (!box || !box.isConnected) return;
    if (!r || !r.ok) { box.textContent = r && r.j && /faster/.test(r.j.error || "") ? T("Too quick to count — a game needs at least 20 seconds") : T("This game couldn't be counted — try again later"); return; }
    const j = r.j, before = status ? status.lv : lv0; status = j.prog || status;
    const m = status && status.mis ? status.mis : { solo: 0 };
    box.classList.toggle("paid", j.credited > 0);
    box.innerHTML = `${j.xp ? `<span>+${j.xp} ${esc(T("poker XP"))}</span>` : `<span>${esc(T("Today's poker XP is full"))}</span>`}<span>${esc(T("Solo games today: {n}/{m}", { n: Math.min(m.solo, 3), m: 3 }))}</span>${j.credited > 0 ? `<b>+${fmt(j.credited)} ARCL · ${esc(T("Mission complete!"))}</b>` : ""}`;
    if (j.credited > 0) { snd("coin"); if (ctx.refresh) ctx.refresh(); confetti(30); }
    if (m.solo === 2) say(T("Two down, one to go~ Today's mission is almost yours! 💙💚"), 4000);
    levelUp(before);
  }
  function levelUp(before) { const now = lvInfo().lv; if (now > before) { banner(`<b>${esc(T("LEVEL UP!"))} Lv ${now}</b><small>${esc(T(titleOf(now)))}</small>`, "jackpot"); const u = [...BACKS, ...FELTS].filter((x) => x.lv > before && x.lv <= now); if (u.length) setTimeout(() => ctx.toast(esc(T("Unlocked: {x}", { x: u.map((x) => T(x.name)).join(", ") }))), 1200); } }

  // ---------------- the tables (a wallet): the server deals; this page asks for the table about once a second ----------------
  const errText = (e) => { const m = String((e && e.message) || e || ""); const known = { "not enough chips for this table": "Not enough chips for this table", "the table is full": "That table is full", "no table with that code": "No table with that code", "not your turn": "Not your turn", "no such table": "That table has closed", network: "Network trouble — try again" }; return T(known[m] || m).slice(0, 80); };
  async function api(body) {
    const ss = ctx.sess && ctx.sess(); if (!ss) throw new Error(T("Sign in with a wallet to play at the tables"));
    let r; try { r = await ctx.post({ ...body, ...ss }); } catch { throw new Error("network"); }
    if (!r || !r.ok) throw Object.assign(new Error((r && r.j && r.j.error) || "network"), { status: r && r.status });
    return r.j;
  }
  const stakeOf = (id) => POKER.STAKES.find((x) => x.id === id) || POKER.STAKES[0];
  function modelOf(room) { return { kind: "mp", id: room.id, seats: room.seats, me: room.me, hand: room.hand, deadline: room.deadline ? room.deadline - (R ? R.off : 0) : 0, stake: stakeOf(room.stake), code: room.code, priv: room.priv }; }
  function sitAt(room, o = {}) {
    G = null; R = { id: room.id, tok: {}, off: room.now - Date.now(), auto: !!o.auto, watch: !!o.watch, paid: room.paid || 0, fails: 0, chatN: 0, alone: 0 };
    if (!o.watch) try { localStorage.setItem(ROOMK, room.id); } catch { /* reconnect needs the lobby */ }
    toTable(); vis = blank(); syncRoom(room); poll(R.tok);
    if (room.priv && room.code && !o.watch) setTimeout(() => ctx.toast(esc(T("Private table · code {c} — share it with friends", { c: room.code }))), 600);
  }
  function syncRoom(room) {
    if (!R || !room || room.id !== R.id) return;
    R.off = room.now - Date.now(); R.room = room;
    if (room.paid > R.paid) { R.paid = room.paid; ctx.toast(`<b>+${fmt(room.paid)} ARCL</b> · ${esc(T("Mission complete: 20 table hands"))}`); snd("coin"); if (ctx.refresh) ctx.refresh(); }
    if (room.me >= 0) R.seated = true; else if (R.seated) { R.seated = false; try { localStorage.removeItem(ROOMK); } catch { /* fine */ } }
    // a quick-match table with only you at it: computer players join after a few seconds
    const n = room.seats.filter(Boolean).length;
    if (R.auto && room.me >= 0 && n === 1 && !room.hand) { if (!R.alone) R.alone = Date.now(); else if (Date.now() - R.alone > 6000 * fast) { R.auto = false; addBots(2); } } else R.alone = 0;
    paintChat(room.chat || []);
    sync(modelOf(room));
  }
  /// how soon to ask again: sooner when you're next or a computer is thinking (the server moves them on a look), slower
  /// while it's your own turn (nothing changes until you act) and when the page is hidden
  function pollGap() {
    if (document.hidden) return 4000; const H = R && R.room && R.room.hand; if (!H || H.street >= 4) return 1200;
    const ti = H.toAct, seat = R.room.seats[H.seatOf[ti]];
    if (H.mine >= 0 && ti === H.mine) return 1500;
    if (seat && seat.bot) return 950;
    if (H.mine >= 0 && !H.p[H.mine].folded) { for (let k = 1; k < H.p.length; k++) { const j = (ti + k) % H.p.length, q = H.p[j]; if (!q.folded && !q.out && !q.allin) { if (j === H.mine) return 650; break; } } }
    return 1200;
  }
  async function poll(tok) {
    while (R && R.tok === tok && on) {
      await sleep(pollGap());
      if (!R || R.tok !== tok || !on) break;
      try { const j = await api({ action: "world-poker-view", room: R.id }); if (!R || R.tok !== tok) break; R.fails = 0; ui.root.classList.remove("lost"); syncRoom(j.room); }
      catch (e) {
        if (e && e.status === 404) { ctx.toast(esc(T("That table has closed"))); try { localStorage.removeItem(ROOMK); } catch { /* fine */ } R = null; lobby(); break; }
        if (R && ++R.fails >= 3) ui.root.classList.add("lost");
      }
    }
  }
  async function addBots(n) { if (!R) return; try { const j = await api({ action: "world-poker-bots", room: R.id, n, lvl: 1 }); syncRoom(j.room); snd("enter"); } catch (e) { ctx.toast(esc(errText(e))); } }
  async function leaveTable() {
    const r = R; R = null; if (!r) return; try { localStorage.removeItem(ROOMK); } catch { /* fine */ }
    if (r.seated || (r.room && r.room.me >= 0)) { try { await api({ action: "world-poker-leave", room: r.id }); } catch (e) { ctx.toast(esc(T("Couldn't leave the table cleanly: {e}", { e: errText(e) }))); } }
  }
  async function guard(fn) { if (busy) return; busy = true; ui.root.classList.add("wait"); try { await fn(); } catch (e) { ctx.toast(esc(errText(e))); snd("bad"); } finally { busy = false; if (ui) ui.root.classList.remove("wait"); } }
  const quick = (stake) => guard(async () => {
    const list = await fetch("/api/social?world=poker-rooms", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const pick = ((list && list.rooms) || []).filter((x) => x.stake === stake && x.n < POKER.MAX && x.h > 0).sort((a, b) => b.h - a.h || b.n - a.n)[0];
    let j = null, auto = false;
    if (pick) try { j = await api({ action: "world-poker-join", room: pick.id }); } catch { j = null; }
    if (!j) { j = await api({ action: "world-poker-create", stake, priv: false }); auto = true; }
    snd("enter"); sitAt(j.room, { auto });
  });
  const join = (id, watch) => guard(async () => {
    if (watch) { const j = await api({ action: "world-poker-view", room: id }); sitAt(j.room, { watch: true }); return; }
    const j = await api({ action: "world-poker-join", room: id }); snd("enter"); sitAt(j.room);
  });
  const joinCode = (code) => guard(async () => { if (!/^\d{6}$/.test(code)) throw new Error(T("A table code is 6 digits")); const j = await api({ action: "world-poker-join", code }); snd("enter"); sitAt(j.room); });
  const createPriv = (stake) => guard(async () => { const j = await api({ action: "world-poker-create", stake, priv: true }); snd("enter"); sitAt(j.room); });
  async function chatSend(text) { if (!R) return; ui.chat.hidden = true; try { const j = await api({ action: "world-poker-chat", room: R.id, text }); syncRoom(j.room); } catch (e) { ctx.toast(esc(errText(e))); } }
  function paintChat(list) {
    if (!R) return; const fresh = list.filter((x) => x.at > (R.chatAt || 0)); if (!fresh.length) return; const first = !R.chatAt; R.chatAt = Math.max(...list.map((x) => x.at)); if (first && list.length > 3) return;
    for (const m of fresh.slice(-3)) {
      const txt = EMO[m.t] || (PHRASES.includes(m.t) ? T(m.t) : m.t), el = document.createElement("div"); el.className = "pk-msg" + (m.e ? " emo" : ""); el.innerHTML = `<b>${esc(m.n)}</b> ${esc(txt)}`; ui.log.appendChild(el); setTimeout(() => el.remove(), 7000);
      while (ui.log.children.length > 4) ui.log.firstChild.remove();
      const M = vis.M; if (M) { const si = M.seats.findIndex((s) => s && s.name === m.n); if (si >= 0) { const el2 = ui.seats[dispOf(M, si)], bb = document.createElement("i"); bb.className = "pk-bubble"; bb.textContent = txt; el2.appendChild(bb); setTimeout(() => bb.remove(), 3200); } }
    }
  }

  // ---------------- the lounge (lobby) ----------------
  async function readStatus() {
    const jobs = [];
    if (signed()) jobs.push(ctx.post({ action: "world-poker-me", ...ctx.sess() }).then((r) => { if (r && r.ok && r.j) status = r.j.prog; }).catch(() => {}));
    if (signed() && tab === "play") jobs.push(fetch("/api/social?world=poker-rooms", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { roomsL = j && j.rooms; }).catch(() => {}));
    if (tab === "rank") jobs.push(fetch("/api/social?world=poker-top").then((r) => (r.ok ? r.json() : null)).then((j) => { topB = j; }).catch(() => {}));
    await Promise.race([Promise.all(jobs), sleep(4000)]);
  }
  function toTable() { if (BJK.active()) BJK.stop(); setFelt("poker"); ui.replayB.hidden = false; mode = "table"; closeModal(); ui.sheet.hidden = true; ui.root.classList.remove("menu"); ui.top.hidden = false; ui.hand.hidden = false; ui.replayB.disabled = true; if (S && S.ace) S.ace.visible = false; clearTable(); frame(); }
  function sheet(html) { ui.sheet.innerHTML = html; ui.sheet.hidden = false; ui.sheet.scrollTop = 0; }
  function hideTable() { ui.root.classList.add("menu"); ui.top.hidden = true; ui.hand.hidden = true; ui.bar.hidden = true; ui.raise.hidden = true; ui.wait.hidden = true; ui.tools.hidden = true; ui.chat.hidden = true; ui.pot.hidden = true; ui.betL.forEach((e) => { e.hidden = true; }); ui.seats.forEach((e) => { e.hidden = true; }); }
  function toBJ() { mode = "bj"; G = null; closeModal(); hideTable(); ui.root.classList.remove("menu"); ui.sheet.hidden = true; ui.top.hidden = false; ui.replayB.hidden = true; if (S && S.ace) S.ace.visible = false; clearTable(); setFelt("bj"); frame(); }
  function lobby() {
    if (BJK.active()) BJK.stop(); setFelt("poker");
    mode = "lobby"; G = null; if (R) { leaveTable(); } Q.length = 0; latest = null; vis = blank(); clearTable(); closeModal();
    hideTable();
    if (S && S.ace) S.ace.visible = true; frame(); paintLobby();
    if (!lobby.said) { lobby.said = true; say(T("Let's play together~ ♡"), 3200); }
    readStatus().then(() => { if (mode === "lobby") paintLobby(); });
  }
  function paintLobby() {
    const sg = signed(), li = lvInfo(), chips = status ? status.chips : 0, saved = (() => { try { return localStorage.getItem(ROOMK) || ""; } catch { return ""; } })();
    const tabs = [["play", T("Play")], ["missions", T("Missions")], ["rank", T("Ranking")], ["profile", T("Profile")], ["rules", T("How to play")]];
    let pane = "";
    if (tab === "play") {
      pane = `<section class="pk-box solo"><header><b>${esc(T("SOLO"))}</b><small>${esc(T("{n} hands · {c} chips each · blinds rise every 4 hands", { n: POKER.SOLO_HANDS, c: fmt(POKER.START) }))}</small></header>
        <div class="pk-opt"><span>${esc(T("AI players"))}</span><div class="pk-seg">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-ais="${n}" class="${prog.ais === n ? "on" : ""}">${n}</button>`).join("")}</div></div>
        <div class="pk-opt"><span>${esc(T("Level"))}</span><div class="pk-seg">${LEVELS.map((l, k) => `<button type="button" data-lvl="${k}" class="${prog.lvl === k ? "on" : ""}">${esc(T(l))}</button>`).join("")}</div></div>
        <button type="button" class="pk-btn go wide" data-a="solo">${esc(T("PLAY SOLO"))}</button></section>
        <section class="pk-box bjbox"><header><b>${esc(T("BLACKJACK"))}</b><small>${esc(T("vs ARCIA · free {n} chips · blackjack pays 3 to 2", { n: fmt(BJ.START) }))}</small></header><button type="button" class="pk-btn go wide" data-a="bj">${esc(T("PLAY BLACKJACK"))}</button></section>`;
      if (!sg) pane += `<section class="pk-box mp"><header><b>${esc(T("MULTIPLAYER"))}</b><small>${esc(T("2–6 players at a real table"))}</small></header><p class="pk-note">${esc(T("Sign in with a wallet to play at the tables"))}</p></section>`;
      else pane += `<section class="pk-box mp"><header><b>${esc(T("MULTIPLAYER"))}</b><small>${esc(T("Your chips: {n}", { n: fmt(chips) }))} · ${esc(T("free {n} a day", { n: fmt(POKER.DAY_CHIPS) }))}</small></header>
        ${saved ? `<button type="button" class="pk-btn hot wide" data-room="${esc(saved)}">${esc(T("Back to your table"))}</button>` : ""}
        <p class="pk-lbl">${esc(T("Quick match"))}</p><div class="pk-stakes">${POKER.STAKES.map((s) => `<button type="button" data-quick="${s.id}" ${status && chips < s.buy ? "disabled" : ""}><b>${fmt(s.sb)}/${fmt(s.bb)}</b><small>${esc(T("buy-in {n}", { n: fmt(s.buy) }))}</small></button>`).join("")}</div>
        <p class="pk-lbl">${esc(T("Open tables"))} <button type="button" class="pk-mini" data-a="rooms">↻</button></p>
        <ul class="pk-rooms">${roomsL && roomsL.length ? roomsL.map((r) => { const s = stakeOf(r.stake); return `<li><b>${fmt(s.sb)}/${fmt(s.bb)}</b><span>${r.n}/6 · ${esc(T("{n} people", { n: r.h }))}${r.playing ? " · " + esc(T("playing")) : ""}</span><button type="button" class="pk-mini" data-watch="${esc(r.id)}">${esc(T("Watch"))}</button><button type="button" class="pk-mini go" data-room="${esc(r.id)}" ${r.n >= 6 ? "disabled" : ""}>${esc(T("Join"))}</button></li>`; }).join("") : `<li class="none">${esc(T("No open tables right now — start one with Quick match"))}</li>`}</ul>
        <p class="pk-lbl">${esc(T("Private table"))}</p><div class="pk-priv"><select data-pstake>${POKER.STAKES.map((s) => `<option value="${s.id}">${fmt(s.sb)}/${fmt(s.bb)}</option>`).join("")}</select><button type="button" class="pk-mini go" data-a="priv">${esc(T("Create"))}</button><input inputmode="numeric" maxlength="6" placeholder="${esc(T("6-digit code"))}" data-code><button type="button" class="pk-mini go" data-a="code">${esc(T("Join"))}</button></div></section>`;
    } else if (tab === "missions") {
      const m = status && status.mis ? status.mis : { solo: 0, hands: 0 }, row = (k, have, need, t) => `<li class="${have >= need ? "done" : ""}"><b>${esc(t)}</b><div class="pk-bar2"><i style="width:${Math.min(100, (have / need) * 100)}%"></i></div><span>${Math.min(have, need)}/${need}</span><em>+${fmt(POKER.MISSIONS[k].arcl)} ARCL</em></li>`;
      pane = sg ? `<ul class="pk-mis">${row("solo3", m.solo || 0, 3, T("Finish 3 solo games"))}${row("hands20", m.hands || 0, 20, T("Play 20 table hands"))}${row("bj30", m.bj || 0, 30, T("Play 30 blackjack hands"))}</ul><p class="pk-note">${esc(T("Once a day each · never for winning — the chips are play money"))}</p>` : `<p class="pk-note">${esc(T("Sign in with a wallet to earn ARCL from the daily missions"))}</p><ul class="pk-mis dim">${row("solo3", 0, 3, T("Finish 3 solo games"))}${row("hands20", 0, 20, T("Play 20 table hands"))}${row("bj30", 0, 30, T("Play 30 blackjack hands"))}</ul>`;
      pane += `<p class="pk-note">${esc(T("Chips are free every day and can't be bought, sold or turned into ARCL."))}</p>`;
    } else if (tab === "rank") {
      const rows = (topB && topB.top) || [];
      pane = `<p class="pk-lbl">${esc(T("This week's most chips won at the tables"))}</p><ol class="pk-rank">${rows.length ? rows.map((x, k) => `<li><i>${k + 1}</i><b>${esc(x.name || x.w)}</b><span class="${x.n >= 0 ? "up" : "down"}">${x.n >= 0 ? "+" : ""}${fmt(x.n)}</span></li>`).join("") : `<li class="none">${esc(T("No one on the board yet this week — be the first!"))}</li>`}</ol>`;
    } else if (tab === "profile") {
      const games = status ? status.games : prog.games, wins = status ? status.wins : prog.wins, bst = status ? status.best : prog.best, ul = unlockLv();
      pane = `<div class="pk-prof"><b class="pk-lvn">Lv ${li.lv}</b><span>${esc(T(titleOf(li.lv)))}</span><div class="pk-bar2 xp"><i style="width:${li.lv >= POKER.LEVELS ? 100 : (li.into / li.need) * 100}%"></i></div><small>${li.lv >= POKER.LEVELS ? "MAX" : `${fmt(li.into)} / ${fmt(li.need)} XP`}</small></div>
        <div class="pk-stats"><span>${esc(T("Games"))} <b>${fmt(games)}</b></span><span>${esc(T("Win rate"))} <b>${games ? Math.round((wins / games) * 100) : 0}%</b></span><span>${esc(T("Best hand"))} <b>${bst >= 0 ? esc(T(HANDS[bst])) : "–"}</b></span>${status ? `<span>${esc(T("Table hands"))} <b>${fmt(status.hands)}</b></span>` : ""}<span>${esc(T("Blackjack hands"))} <b>${fmt(status ? status.bjHands : prog.bjHands || 0)}</b></span><span>${esc(T("Blackjacks"))} <b>${fmt(status ? status.bjBJ : prog.bjBJ || 0)}</b></span></div>
        <p class="pk-lbl">${esc(T("Card backs"))}</p><div class="pk-skins">${BACKS.map((b) => `<button type="button" data-back="${b.id}" class="${prog.back === b.id ? "on" : ""}" ${ul < b.lv ? "disabled" : ""} style="--a:${b.a};--b:${b.b}"><i class="sw back"></i><small>${ul < b.lv ? "🔒 Lv " + b.lv : esc(T(b.name))}</small></button>`).join("")}</div>
        <p class="pk-lbl">${esc(T("Table felt"))}</p><div class="pk-skins">${FELTS.map((b) => `<button type="button" data-felt="${b.id}" class="${prog.felt === b.id ? "on" : ""}" ${ul < b.lv ? "disabled" : ""} style="--a:${b.a};--b:${b.b}"><i class="sw felt"></i><small>${ul < b.lv ? "🔒 Lv " + b.lv : esc(T(b.name))}</small></button>`).join("")}</div>
        <p class="pk-lbl">${esc(T("Settings"))}</p><div class="pk-tog"><button type="button" data-tog="hint" class="${prog.hint ? "on" : ""}">${esc(T("Hand strength hint"))}<b>${esc(prog.hint ? T("On") : T("Off"))}</b></button>${ctx.coarse ? `<button type="button" data-tog="buzz" class="${prog.buzz ? "on" : ""}">${esc(T("Vibration"))}<b>${esc(prog.buzz ? T("On") : T("Off"))}</b></button>` : ""}</div>
        <p class="pk-note">${esc(T("Poker XP: +{a} a finished game (a table game is 10 hands), up to {b} a day", { a: POKER.XP_GAME, b: POKER.XP_DAY }))}</p>`;
    } else {
      pane = `<ol class="pk-rules"><li>${esc(T("Everyone gets two cards; five shared cards come in the middle (3, then 1, then 1)."))}</li><li>${esc(T("Make the best five-card hand from your two and the five shared."))}</li><li>${esc(T("Each round: check, bet, call, raise or fold. The best hand at the end — or the last one left — wins the pot."))}</li></ol>
        <ul class="pk-ranks">${HANDS.slice().reverse().map((h, k) => `<li><b>${k + 1}. ${esc(T(h))}</b><span>${EXAMPLES[k].map((s) => cardHtml(cc(s), "sm")).join("")}</span></li>`).join("")}</ul>`;
    }
    sheet(`<div class="pk-lobby"><div class="pk-head"><i class="pk-face"></i><div><h2>${esc(T("ARCIA POKER LOUNGE"))}</h2><p>${esc(T("Texas Hold'em with ARCIA · free play chips"))}</p></div><span class="pk-lvchip">Lv ${li.lv}</span></div>
      <div class="pk-tabs">${tabs.map(([k, t]) => `<button type="button" data-tab="${k}" class="${k === tab ? "on" : ""}">${esc(t)}</button>`).join("")}</div>
      <div class="pk-pane">${pane}</div>
      <button type="button" class="pk-btn" data-a="leave">${esc(T("Leave the lounge"))}</button></div>`);
  }
  function replay() {
    const r = vis.replay; if (!r) return;
    const nm = (i) => esc(r.names[i] || "?"), streets = [T("Pre-flop"), T("Flop"), T("Turn"), T("River")], lines = [[], [], [], []];
    for (const e of r.log) { if (e.t === "street") continue; const s = Math.min(3, e.st), a = fmt(e.a); lines[s].push(e.t === "sb" || e.t === "bb" ? T("{name} posts {n}", { name: nm(e.i), n: a }) : e.t === "fold" ? T("{name} folds", { name: nm(e.i) }) : e.t === "check" ? T("{name} checks", { name: nm(e.i) }) : e.t === "call" ? T("{name} calls {n}", { name: nm(e.i), n: a }) : e.t === "allin" ? T("{name} goes all in ({n})", { name: nm(e.i), n: a }) : T("{name} raises to {n}", { name: nm(e.i), n: a })); }
    const opp = (s) => { let n = 0; r.alive0.forEach((al, i) => { if (!al || i === r.me) return; const f = r.log.find((e) => e.i === i && e.t === "fold"); if (!f || f.st >= s) n++; }); return Math.max(1, n); };
    const shown = r.result.shown || [], potW = r.result.pots.map((p) => `${p.win.map(nm).join(" & ")} · ${fmt(p.amt)}`).join(" · ");
    modal(`<h3>${esc(T("Hand #{n}", { n: r.handNo }))} · ${fmt(r.sb)}/${fmt(r.bb)}</h3><div class="pk-rep">${streets.map((t, s) => { const bd = r.board.slice(0, s === 0 ? 0 : s + 2); if (s > 0 && !lines[s].length && !(r.log.some((e) => e.t === "street" && e.a === s))) return "";
      const eq = r.mine && r.mine[0] >= 0 ? Math.round(equity(r.mine, bd, opp(s), 240, Math.random) * 100) : null;
      return `<section><header><b>${esc(t)}</b>${bd.length ? `<span>${bd.map((c) => cardHtml(c, "sm")).join("")}</span>` : ""}${eq != null ? `<em>${esc(T("Your chance {n}%", { n: eq }))}</em>` : ""}</header>${lines[s].map((l) => `<p>${l}</p>`).join("")}</section>`; }).join("")}
      <section><header><b>${esc(T("Result"))}</b></header>${shown.map((x) => `<p>${nm(x.i)}: ${x.hole.map((c) => cardHtml(c, "sm")).join("")} ${esc(T(x.name))}</p>`).join("")}<p class="win">${esc(T("Pot"))}: ${potW}</p></section></div>
      <div class="pk-row"><button type="button" class="pk-btn" data-a="close">${esc(T("Close"))}</button></div>`);
  }

  // ---------------- the layer ----------------
  const scaleK = () => (document.documentElement.classList.contains("wp-pcphone") ? innerWidth / 400 : Math.max(1, Math.min(1.25, innerHeight / 860)));
  function fit() { if (!ui) return; const k = scaleK(); ui.root.classList.toggle("wide", wide()); Object.assign(ui.root.style, { width: innerWidth / k + "px", height: innerHeight / k + "px", transform: `scale(${k})` }); if (S) frame(); }
  function buildUi() {
    const root = document.createElement("div"); root.className = "pk"; root.hidden = true;
    const seat = (d) => `<div class="pk-seat" data-d="${d}" hidden><div class="pk-av"><i class="pk-ring"></i><span></span></div><div class="pk-info"><b class="nm"></b><span class="sk"></span><small class="lv"></small></div><em class="pk-act" hidden></em><strong class="pk-shown" hidden></strong></div>`;
    root.innerHTML = `<div class="pk-top" data-game-hud hidden><button type="button" class="pk-back" data-a="menu" aria-label="${esc(T("Lounge"))}"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><div class="pk-title"><b></b><small></small></div><button type="button" class="pk-back" data-a="replay" aria-label="${esc(T("Replay"))}" disabled><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5"/></svg></button></div>
      <div class="pk-tools" hidden><button type="button" data-a="bot">${esc(T("+ AI"))}</button><button type="button" data-a="sit">${esc(T("Sit down"))}</button><button type="button" data-a="chat">💬</button><button type="button" data-a="menu">${esc(T("Leave"))}</button></div>
      <div class="pk-chat" hidden>${Object.keys(EMO).map((k) => `<button type="button" data-say="${k}">${EMO[k]}</button>`).join("")}${PHRASES.map((p) => `<button type="button" data-say="${esc(p)}" class="ph">${esc(T(p))}</button>`).join("")}</div>
      <div class="pk-seats">${[1, 2, 3, 4, 5].map(seat).join("")}</div>
      <div class="pk-pot" hidden><small>${esc(T("POT"))}</small><b></b></div>${Array.from({ length: 6 }, () => '<i class="pk-betl" hidden></i>').join("")}
      <div class="pk-arcia" hidden></div><div class="pk-log"></div>
      <div class="pk-wait" hidden><span></span></div>
      <div class="pk-hand" hidden>${seat(0)}<div class="pk-mine"></div><div class="pk-hinfo"><b class="pk-hname"></b><em class="pk-eq"></em><div class="pk-str" hidden><span><i></i></span><b></b></div></div></div>
      <div class="pk-raise" hidden><div class="pk-pre"><button type="button" data-pre="min">${esc(T("Min"))}</button><button type="button" data-pre="0.5">½ ${esc(T("Pot"))}</button><button type="button" data-pre="1">${esc(T("Pot"))}</button><button type="button" data-pre="2">2× ${esc(T("Pot"))}</button></div><div class="pk-sl"><input type="range"><b class="amt"></b></div><div class="pk-row"><button type="button" class="pk-btn" data-a="raiseX">${esc(T("Cancel"))}</button><button type="button" class="pk-btn go" data-a="raiseGo"></button></div></div>
      <div class="pk-bar" hidden><button type="button" class="f" data-a="fold"><b>${esc(T("FOLD"))}</b></button><button type="button" class="c" data-a="call"></button><button type="button" class="r" data-a="raise"></button><button type="button" class="a" data-a="allin"><b>${esc(T("ALL IN"))}</b></button></div>
      <div class="pk-banner" hidden></div><div class="pk-lost">${esc(T("Reconnecting…"))}</div>
      <div class="pk-sheet" hidden></div><div class="pk-modal" hidden></div>`;
    document.body.appendChild(root);
    const q = (x) => root.querySelector(x);
    ui = { root, top: q(".pk-top"), title: q(".pk-title b"), sub: q(".pk-title small"), replayB: q('[data-a="replay"]'), tools: q(".pk-tools"), chat: q(".pk-chat"), pot: q(".pk-pot"), potV: q(".pk-pot b"), betL: [...root.querySelectorAll(".pk-betl")], arcia: q(".pk-arcia"), log: q(".pk-log"), wait: q(".pk-wait"), hand: q(".pk-hand"), mine: q(".pk-mine"), hname: q(".pk-hname"), eq: q(".pk-eq"), str: q(".pk-str"), raise: q(".pk-raise"), bar: q(".pk-bar"), banner: q(".pk-banner"), sheet: q(".pk-sheet"), modal: q(".pk-modal"),
      b: { fold: q('[data-a="fold"]'), call: q('[data-a="call"]'), raise: q('[data-a="raise"]'), allin: q('[data-a="allin"]') } };
    ui.seats = [q('.pk-hand .pk-seat'), ...[1, 2, 3, 4, 5].map((d) => q(`.pk-seats [data-d="${d}"]`))];
    ui.raise.querySelector("input").addEventListener("input", paintRaise);
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-code]")) joinCode(e.target.value.trim()); });
    addEventListener("resize", fit); fit();
  }
  function onClick(e) {
    const b = e.target.closest("button"); if (!b || !on || b.disabled) return; const a = b.dataset.a;
    if (b.dataset.tab) { tab = b.dataset.tab; snd("tab"); paintLobby(); if (tab === "rank" || tab === "play" || tab === "missions") readStatus().then(() => { if (mode === "lobby") paintLobby(); }); return; }
    if (b.dataset.ais) { prog.ais = +b.dataset.ais; save(); snd("tap"); paintLobby(); return; }
    if (b.dataset.tog) { const k = b.dataset.tog; prog[k] = !prog[k]; save(); snd("tap"); paintLobby(); return; }
    if (b.dataset.lvl) { prog.lvl = +b.dataset.lvl; save(); snd("tap"); paintLobby(); return; }
    if (b.dataset.back) { prog.back = b.dataset.back; save(); for (const [k, t] of cardTex) if (String(k).startsWith("back:")) { t.dispose(); cardTex.delete(k); } if (S) for (const cd of S.cards) { cd.back.material.map = faceTex(-1); cd.back.material.needsUpdate = true; } snd("equip"); paintLobby(); return; }
    if (b.dataset.felt) { prog.felt = b.dataset.felt; save(); if (S) { const old = S.feltM.map; S.feltM.map = texOf(feltCanvas()); S.feltM.needsUpdate = true; if (old) old.dispose(); } snd("equip"); paintLobby(); return; }
    if (b.dataset.quick) { quick(b.dataset.quick); return; }
    if (b.dataset.room) { join(b.dataset.room, false); return; }
    if (b.dataset.watch) { join(b.dataset.watch, true); return; }
    if (b.dataset.say) { chatSend(b.dataset.say); return; }
    if (b.dataset.pre) { const H = vis.M && vis.M.hand, L = H && legal(H); if (!L || !L.raise) return; const P0 = pot(H) + L.toCall, k = b.dataset.pre, to = k === "min" ? L.raise.min : Math.round((H.curBet + P0 * +k) / H.bb) * H.bb; ui.raise.querySelector("input").value = Math.max(L.raise.min, Math.min(L.raise.max, to)); paintRaise(); snd("tap"); return; }
    if (a === "leave") leave();
    else if (a === "menu" && mode === "bj") lobby();
    else if (a === "menu") { if (mode === "table" && G && !G.over) modal(`<p>${esc(T("Leave this game? It won't count."))}</p><div class="pk-row"><button type="button" class="pk-btn" data-a="close">${esc(T("Stay"))}</button><button type="button" class="pk-btn hot" data-a="lobby">${esc(T("Leave"))}</button></div>`); else lobby(); }
    else if (a === "lobby") { closeModal(); lobby(); }
    else if (a === "close") closeModal();
    else if (a === "rebuy") { if (!G || G.over) return; closeModal(); G.asking = false; G.rebuy = 1; G.seats[0].stack = POKER.START; snd("coin"); flash(T("Rebuy: +{n}", { n: fmt(POKER.START) }), "big"); soloDeal(); }
    else if (a === "endGame") { closeModal(); if (G) { G.asking = false; soloOver(); } }
    else if (a === "solo") { snd("enter"); soloStart(); }
    else if (a === "bj") { snd("enter"); BJK.start(); }
    else if (a === "bjIns" || a === "bjNoIns") BJK.answer(a === "bjIns");
    else if (a === "again") { snd("enter"); soloStart(); }
    else if (a === "rooms") readStatus().then(() => { if (mode === "lobby") paintLobby(); });
    else if (a === "priv") createPriv(ui.sheet.querySelector("[data-pstake]").value);
    else if (a === "code") joinCode(String(ui.sheet.querySelector("[data-code]").value || "").trim());
    else if (a === "fold") move({ t: "fold" });
    else if (a === "call") { const H = vis.M && vis.M.hand, L = H && legal(H); if (L) move(L.check ? { t: "check" } : { t: "call" }); }
    else if (a === "raise") { ui.raise.hidden = !ui.raise.hidden; snd("tap"); }
    else if (a === "raiseX") ui.raise.hidden = true;
    else if (a === "raiseGo") { const v = Math.round(+ui.raise.querySelector("input").value), H = vis.M && vis.M.hand, L = H && legal(H); if (!L || !L.raise) return; if (v >= L.raise.max) allinAsk(); else move({ t: "raise", to: v }); }
    else if (a === "allin") allinAsk();
    else if (a === "allinGo") { closeModal(); move({ t: "allin" }); }
    else if (a === "replay") replay();
    else if (a === "bot") addBots(1);
    else if (a === "sit") { if (R) join(R.id, false); }
    else if (a === "chat") ui.chat.hidden = !ui.chat.hidden;
  }
  const kd = (e) => {
    if (!on || e.target.matches("input,select,textarea")) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (G && G.asking) return; if (!ui.modal.hidden) closeModal(); else if (mode === "table" || mode === "result" || mode === "bj") onClick({ target: ui.root.querySelector('.pk-top [data-a="menu"]') }); else leave(); return; }
    if (mode === "bj") { const k = e.key.toLowerCase(), m = { h: "hit", s: "stand", d: "double", p: "split", " ": "deal", enter: "deal" }[k]; if (m) { e.preventDefault(); BJK.press(m); } return; }
    if (mode !== "table" || !myTurn(vis.M)) return; const k = e.key.toLowerCase();
    if (k === "f" && !ui.b.fold.hidden) move({ t: "fold" }); else if (k === "c") ui.b.call.click(); else if (k === "r" && !ui.b.raise.hidden) ui.b.raise.click(); else if (k === "a" && !ui.b.allin.hidden) allinAsk();
  };

  // ---------------- each frame ----------------
  let lastNow = 0, frameMs = 16;
  function tick(dt0, t) {
    const now = performance.now(), dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : dt0; lastNow = now; frameMs += (dt * 1000 - frameMs) * 0.05;
    if (!S) return;
    if (S.cam.projectionMatrix.elements[9] !== S.p9 || S.key !== [view().w, view().h, mode].join("x")) frame();
    for (let i = TWN.length - 1; i >= 0; i--) { const w = TWN[i]; w.t += dt; if (w.t < 0) continue; const k = Math.min(1, w.t / w.dur); try { w.f(k); } catch { /* a card gone */ } if (k >= 1) { TWN.splice(i, 1); if (w.done) try { w.done(); } catch { /* fine */ } } }
    runQ(now); soloTick(now); if (mode === "bj") BJK.tick();
    if (mode === "table") { place(); if (!Q.length && !latest && ui.bar.hidden === myTurn(vis.M) && !actBusy) paintBar(); }
    else if (!ui.arcia.hidden) { const s = toScreen(1.1, 3.9, -RZ - 0.75), W = innerWidth / scaleK(); ui.arcia.style.transform = `translate(${Math.min(W - 120, s.x)}px, ${Math.max(40, s.y)}px)`; }
    S.deal.position.y = -0.15 + Math.sin(t * 1.3) * 0.03; S.halo.material.opacity = 0.45 + Math.sin(t * 0.9) * 0.1;
    if (S.ace) { S.ace.rotation.y = t * 0.7; S.ace.position.y = 1.3 + Math.sin(t * 1.6) * 0.12; }
  }

  // ---------------- in and out ----------------
  async function enter() {
    if (on || busy) return false; busy = true;
    try {
      if (!ui) buildUi(); ui.root.hidden = false; ui.root.classList.add("menu"); ui.top.hidden = true; ui.hand.hidden = true; ui.bar.hidden = true;
      sheet(`<div class="pk-lobby small"><h3>${esc(T("Opening the lounge…"))}</h3><div class="pk-spin"></div></div>`);
      document.body.classList.add("wp-poker");
      if (!S) build();
      mode = "load"; prog = load(); await readStatus();
      prOrig = st.renderer.getPixelRatio();
      const pr = Math.min(prOrig, ctx.low || /^(saver|low)$/.test(String(ctx.quality)) ? 1 : phone() ? 1.5 : 1.75); if (pr !== prOrig) st.renderer.setPixelRatio(pr);
      if (!S.comp && !ctx.low && !phone() && ctx.K && ctx.K.POSTFX) { try { const P = ctx.K.POSTFX, comp = new P.EffectComposer(st.renderer); comp.addPass(new P.RenderPass(S.scene, S.cam)); comp.addPass(new P.UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.4, 0.93)); comp.addPass(new P.OutputPass()); S.comp = comp; for (const cd of S.cards) cd.front.material.color.setHex(cardWhite()); } catch (e) { console.warn("poker bloom:", e); } }
      lobby();
      try { if (st.renderer.compileAsync) await Promise.race([st.renderer.compileAsync(S.scene, S.cam), sleep(2500)]); } catch { /* compiled on the first frame */ }
      on = true; st.view(S.scene, S.cam, S.comp); st.solo(tick); lastNow = 0; fit();
      addEventListener("keydown", kd, true);
      return true;
    } catch (e) {
      console.warn("poker", e); ctx.toast(esc(T("The lounge couldn't open: {e}", { e: String((e && e.message) || e).slice(0, 70) }))); try { reset(); } catch { /* already reset */ } return false;
    } finally { busy = false; }
  }
  function reset() {
    on = false; mode = "off"; document.body.classList.remove("wp-poker"); if (ui) { ui.root.hidden = true; ui.sheet.hidden = true; ui.modal.hidden = true; }
    if (BJK.active()) BJK.stop(); if (R) leaveTable(); G = null; Q.length = 0; latest = null; TWN.length = 0; actBusy = false; busy = false;
    removeEventListener("keydown", kd, true);
    try { if (prOrig && st.renderer.getPixelRatio() !== prOrig) st.renderer.setPixelRatio(prOrig); } catch { /* the town sets its own */ }
    try { st.solo(null); st.view(null); } catch { /* the world draws again */ }
  }
  function leave() { if (!on) return; reset(); if (ctx.onLeave) ctx.onLeave(); }
  const BJK = makeBlackjack({ THREE, T, esc, snd, say, banner, flash, confetti, buzz, tween, ease, moveCard, cardFrom, faceTex, toScreen, stackChips, flyChips, S: () => S, cardAt, ui: () => ui, prog: () => prog, save, ctx, signed, fast: () => fast, scaleK, phone, modal, closeModal, enterTable: toBJ, onProg: (p) => { if (p) status = p; } });
  return {
    enter, leave, active: () => on,
    /// tests: the table's numbers, and a few levers
    debug: () => { const M = vis.M, H = M && M.hand; return { mode, kind: M ? M.kind : "", hand: H ? H.handNo : 0, street: H ? H.street : -1, board: vis.board, turn: myTurn(M), legal: H && myTurn(M) ? legal(H) : null, q: Q.length, me: M ? M.me : -1, seats: M ? M.seats.filter(Boolean).length : 0, stack: H && H.mine >= 0 ? vis.stack[H.mine] : null, hands: G ? G.hands : 0, over: G ? G.over : false, room: R ? R.id : "", fms: Math.round(frameMs), result: !!(H && H.result), shown: Object.keys(vis.shown).length, cards: S ? S.cards.filter((c) => c.o.visible).length : 0 }; },
    solo: (n, lvl) => { if (n) prog.ais = n; if (lvl != null) prog.lvl = lvl; soloStart(); }, move: (t, to) => move({ t, to }), tab: (k) => { tab = k; paintLobby(); }, menu: () => lobby(), fast: (k) => { fast = k; },
    quick: (s) => quick(s), code: (c) => joinCode(c), priv: (s) => createPriv(s), replay: () => replay(),
    /// tests: end the solo game now (the hands so far count)
    finish: () => { if (G && !G.over) { Q.length = 0; latest = null; soloOver(); } },
    /// tests: blackjack
    bj: (k, ...a) => (k === "start" ? BJK.start() : k === "debug" ? BJK.debug() : k === "chip" ? BJK.chip(...a) : BJK.press(k)),
  };
}

// ---------------- the lounge's words in Korean, Chinese and Turkish ----------------
Object.assign(LW.ko, {"You": "나", "ALL IN": "올인", "FOLD": "폴드", "CHECK": "체크", "SB": "SB", "BB": "BB", "CALL": "콜", "RAISE": "레이즈", "BET": "벳", "{name}: ALL IN!": "{name}: 올인!", "BIG POT!": "빅 팟!", "Big pot~! ♡": "빅 팟이에요~! ♡", "ALL IN — the board runs out": "올인 — 보드를 끝까지 깔아요", "All in! Here comes the board~": "올인! 보드 나갑니다~", "ARCIA JACKPOT!": "ARCIA 잭팟!", "ROYAL FLUSH": "로열 플러시", "A royal flush?! ARCIA JACKPOT! 💙💚": "로열 플러시?! ARCIA 잭팟! 💙💚", "SPLIT POT": "팟 나눠 갖기", "YOU WIN": "승리", "What a comeback! ♾️": "대역전이에요! ♾️", "Nice hand~ ♡": "멋진 핸드예요~ ♡", "{name} wins": "{name} 승리", "Everyone else folded": "다른 모두가 폴드했어요", "Open seat": "빈자리", "Away": "자리 비움", "Sitting out": "쉬는 중", "Folded": "폴드함", "Your turn~ Call, raise or fold? ♡": "당신 차례예요~ 콜, 레이즈, 아니면 폴드? ♡", "RAISE TO": "레이즈", "Watching · tap Sit down to play": "관전 중 · 앉기를 누르면 참여해요", "You're out of chips at this table": "이 테이블에서 칩을 모두 잃었어요", "Waiting for players… ({n}/6)": "플레이어를 기다리는 중… ({n}/6)", "The next hand starts soon…": "곧 다음 핸드가 시작돼요…", "You're in from the next hand": "다음 핸드부터 참여해요", "Private table": "비공개 테이블", "Table": "테이블", "Solo · {lvl}": "솔로 · {lvl}", "Code {c}": "코드 {c}", "Hand #{n}": "핸드 #{n}", "Hand {n} / {m} · Blinds {b}": "핸드 {n} / {m} · 블라인드 {b}", "That move isn't allowed": "그 액션은 할 수 없어요", "That move didn't go through: {e}": "액션이 전달되지 않았어요: {e}", "Are you sure? ♡ Go all in~?": "정말요? ♡ 올인할까요~?", "Cancel": "취소", "Blinds up: {b}": "블라인드 상승: {b}", "YOU WIN THE GAME!": "게임 승리!", "GAME OVER": "게임 종료", "What a game~ You're a natural! ♡": "대단한 게임이었어요~ 타고났네요! ♡", "Good game~ ♡ One more?": "좋은 게임이었어요~ ♡ 한 판 더?", "Hands": "핸드", "Chips": "칩", "Best hand": "최고 핸드", "Sending your game…": "게임 기록 보내는 중…", "Guest play: sign in to count missions and earn ARCL": "게스트 플레이: 로그인하면 미션이 집계되고 ARCL을 받아요", "Lounge": "라운지", "Play again": "다시 하기", "This game couldn't be counted — try again later": "이 게임은 집계되지 못했어요 — 나중에 다시 해 보세요", "Too quick to count — a game needs at least 20 seconds": "너무 빨라서 집계되지 않아요 — 한 게임은 최소 20초가 필요해요", "poker XP": "포커 경험치", "Today's poker XP is full": "오늘의 포커 경험치를 모두 받았어요", "Solo games today: {n}/{m}": "오늘 솔로 게임: {n}/{m}", "Mission complete!": "미션 완료!", "Two down, one to go~ Today's mission is almost yours! 💙💚": "두 판 끝, 한 판 남았어요~ 오늘 미션이 코앞이에요! 💙💚", "LEVEL UP!": "레벨 업!", "Unlocked: {x}": "잠금 해제: {x}", "Sign in with a wallet to play at the tables": "지갑으로 로그인하면 테이블에서 플레이할 수 있어요", "Private table · code {c} — share it with friends": "비공개 테이블 · 코드 {c} — 친구에게 알려 주세요", "Mission complete: 20 table hands": "미션 완료: 테이블 20핸드", "That table has closed": "그 테이블은 닫혔어요", "Couldn't leave the table cleanly: {e}": "테이블을 제대로 떠나지 못했어요: {e}", "A table code is 6 digits": "테이블 코드는 6자리예요", "Let's play together~ ♡": "같이 놀아요~ ♡", "Play": "플레이", "Missions": "미션", "Ranking": "랭킹", "Profile": "프로필", "How to play": "게임 방법", "SOLO": "솔로", "{n} hands · {c} chips each · blinds rise every 4 hands": "{n}핸드 · 각자 {c}칩 · 4핸드마다 블라인드 상승", "AI players": "AI 플레이어", "Level": "레벨", "PLAY SOLO": "솔로 플레이", "MULTIPLAYER": "멀티플레이", "2–6 players at a real table": "실제 테이블에서 2–6명", "Your chips: {n}": "내 칩: {n}", "free {n} a day": "매일 {n} 무료", "Back to your table": "내 테이블로 돌아가기", "Quick match": "빠른 매칭", "buy-in {n}": "바이인 {n}", "Open tables": "열린 테이블", "{n} people": "{n}명", "playing": "게임 중", "Watch": "관전", "Join": "참가", "No open tables right now — start one with Quick match": "지금은 열린 테이블이 없어요 — 빠른 매칭으로 시작하세요", "Create": "만들기", "6-digit code": "6자리 코드", "Finish 3 solo games": "솔로 게임 3판 완료", "Play 20 table hands": "테이블에서 20핸드 플레이", "Once a day each · never for winning — the chips are play money": "각각 하루 한 번 · 이겨서 받는 보상이 아니에요 — 칩은 게임용이에요", "Sign in with a wallet to earn ARCL from the daily missions": "지갑으로 로그인하면 데일리 미션으로 ARCL을 받아요", "Chips are free every day and can't be bought, sold or turned into ARCL.": "칩은 매일 무료이고, 사거나 팔거나 ARCL로 바꿀 수 없어요.", "This week's most chips won at the tables": "이번 주 테이블에서 가장 많은 칩을 딴 사람", "No one on the board yet this week — be the first!": "이번 주 아직 기록이 없어요 — 첫 주인공이 되세요!", "Games": "게임", "Win rate": "승률", "Table hands": "테이블 핸드", "Card backs": "카드 뒷면", "Table felt": "테이블 펠트", "Poker XP: +{a} a finished game (a table game is 10 hands), up to {b} a day": "포커 경험치: 게임 완료마다 +{a} (테이블은 10핸드가 한 게임), 하루 최대 {b}", "Everyone gets two cards; five shared cards come in the middle (3, then 1, then 1).": "모두 카드 2장을 받고, 가운데에 공용 카드 5장이 깔려요 (3장, 1장, 1장).", "Make the best five-card hand from your two and the five shared.": "내 카드 2장과 공용 카드 5장으로 가장 좋은 5장 조합을 만드세요.", "Each round: check, bet, call, raise or fold. The best hand at the end — or the last one left — wins the pot.": "매 라운드: 체크, 벳, 콜, 레이즈 또는 폴드. 마지막에 가장 좋은 핸드 — 또는 마지막까지 남은 사람이 팟을 가져가요.", "ARCIA POKER LOUNGE": "ARCIA 포커 라운지", "Texas Hold'em with ARCIA · free play chips": "ARCIA와 텍사스 홀덤 · 무료 게임 칩", "Leave the lounge": "라운지 나가기", "Pre-flop": "프리플랍", "Flop": "플랍", "Turn": "턴", "River": "리버", "{name} posts {n}": "{name} 블라인드 {n}", "{name} folds": "{name} 폴드", "{name} checks": "{name} 체크", "{name} calls {n}": "{name} 콜 {n}", "{name} goes all in ({n})": "{name} 올인 ({n})", "{name} raises to {n}": "{name} {n}으로 레이즈", "Your chance {n}%": "내 승률 {n}%", "Result": "결과", "Pot": "팟", "Close": "닫기", "Replay": "리플레이", "+ AI": "+ AI", "Sit down": "앉기", "Leave": "나가기", "POT": "팟", "Min": "최소", "Reconnecting…": "다시 연결하는 중…", "Leave this game? It won't count.": "이 게임을 나갈까요? 기록되지 않아요.", "Stay": "계속하기", "Opening the lounge…": "라운지 여는 중…", "The lounge couldn't open: {e}": "라운지를 열지 못했어요: {e}", "Classic Blue": "클래식 블루", "Mint": "민트", "Gold": "골드", "Infinity": "인피니티", "Lounge Violet": "라운지 바이올렛", "Emerald": "에메랄드", "Midnight Blue": "미드나잇 블루", "Crimson": "크림슨", "Rookie": "루키", "Regular": "단골", "Sharp Player": "날카로운 플레이어", "High Roller": "하이 롤러", "Lounge Star": "라운지 스타", "ARCIA's Favorite": "ARCIA의 최애", "Lounge Legend": "라운지 레전드", "Infinity Ace": "인피니티 에이스", "Beginner": "초보", "Normal": "보통", "Hard": "어려움", "Expert": "전문가", "High Card": "하이 카드", "One Pair": "원 페어", "Two Pair": "투 페어", "Three of a Kind": "트리플", "Straight": "스트레이트", "Flush": "플러시", "Full House": "풀 하우스", "Four of a Kind": "포카드", "Straight Flush": "스트레이트 플러시", "Royal Flush": "로열 플러시", "Nice hand!": "나이스 핸드!", "Good luck!": "행운을 빌어요!", "One more?": "한 판 더?", "Not enough chips for this table": "이 테이블에 앉을 칩이 부족해요", "That table is full": "그 테이블은 꽉 찼어요", "No table with that code": "그 코드의 테이블이 없어요", "Not your turn": "당신 차례가 아니에요", "Network trouble — try again": "네트워크 문제 — 다시 시도해 주세요"});
Object.assign(LW.zh, {"You": "你", "ALL IN": "全下", "FOLD": "弃牌", "CHECK": "过牌", "SB": "小盲", "BB": "大盲", "CALL": "跟注", "RAISE": "加注", "BET": "下注", "{name}: ALL IN!": "{name}：全下！", "BIG POT!": "大底池！", "Big pot~! ♡": "大底池哦~！♡", "ALL IN — the board runs out": "全下——发完公共牌", "All in! Here comes the board~": "全下！公共牌来啦~", "ARCIA JACKPOT!": "ARCIA 大奖！", "ROYAL FLUSH": "皇家同花顺", "A royal flush?! ARCIA JACKPOT! 💙💚": "皇家同花顺？！ARCIA 大奖！💙💚", "SPLIT POT": "平分底池", "YOU WIN": "你赢了", "What a comeback! ♾️": "大逆转！♾️", "Nice hand~ ♡": "好牌~ ♡", "{name} wins": "{name} 获胜", "Everyone else folded": "其他人都弃牌了", "Open seat": "空座位", "Away": "离开", "Sitting out": "暂离牌局", "Folded": "已弃牌", "Your turn~ Call, raise or fold? ♡": "轮到你啦~ 跟注、加注还是弃牌？♡", "RAISE TO": "加注到", "Watching · tap Sit down to play": "观战中 · 点“入座”加入", "You're out of chips at this table": "你在这张桌上的筹码用完了", "Waiting for players… ({n}/6)": "等待玩家…（{n}/6）", "The next hand starts soon…": "下一手牌马上开始…", "You're in from the next hand": "你将从下一手牌开始参与", "Private table": "私人牌桌", "Table": "牌桌", "Solo · {lvl}": "单人 · {lvl}", "Code {c}": "代码 {c}", "Hand #{n}": "第 {n} 手", "Hand {n} / {m} · Blinds {b}": "第 {n} / {m} 手 · 盲注 {b}", "That move isn't allowed": "不能这样操作", "That move didn't go through: {e}": "操作没有成功：{e}", "Are you sure? ♡ Go all in~?": "确定吗？♡ 要全下吗~？", "Cancel": "取消", "Blinds up: {b}": "盲注上涨：{b}", "YOU WIN THE GAME!": "你赢下了这局！", "GAME OVER": "游戏结束", "What a game~ You're a natural! ♡": "精彩的一局~ 你真有天赋！♡", "Good game~ ♡ One more?": "好局~ ♡ 再来一局？", "Hands": "手数", "Chips": "筹码", "Best hand": "最佳牌型", "Sending your game…": "正在提交本局…", "Guest play: sign in to count missions and earn ARCL": "游客模式：登录后可计入任务并赚取 ARCL", "Lounge": "酒廊", "Play again": "再来一局", "This game couldn't be counted — try again later": "这局未能计入——请稍后再试", "Too quick to count — a game needs at least 20 seconds": "太快了，不计入——一局至少需要 20 秒", "poker XP": "扑克经验", "Today's poker XP is full": "今日扑克经验已满", "Solo games today: {n}/{m}": "今日单人局：{n}/{m}", "Mission complete!": "任务完成！", "Two down, one to go~ Today's mission is almost yours! 💙💚": "两局完成，还差一局~ 今日任务就快到手啦！💙💚", "LEVEL UP!": "升级！", "Unlocked: {x}": "已解锁：{x}", "Sign in with a wallet to play at the tables": "用钱包登录即可上桌对战", "Private table · code {c} — share it with friends": "私人牌桌 · 代码 {c} —— 分享给好友吧", "Mission complete: 20 table hands": "任务完成：牌桌 20 手", "That table has closed": "那张牌桌已关闭", "Couldn't leave the table cleanly: {e}": "未能顺利离桌：{e}", "A table code is 6 digits": "牌桌代码是 6 位数字", "Let's play together~ ♡": "一起玩吧~ ♡", "Play": "开始", "Missions": "任务", "Ranking": "排行", "Profile": "资料", "How to play": "玩法", "SOLO": "单人", "{n} hands · {c} chips each · blinds rise every 4 hands": "{n} 手 · 每人 {c} 筹码 · 每 4 手盲注上涨", "AI players": "AI 玩家", "Level": "难度", "PLAY SOLO": "开始单人局", "MULTIPLAYER": "多人", "2–6 players at a real table": "2–6 人真实牌桌", "Your chips: {n}": "你的筹码：{n}", "free {n} a day": "每天免费 {n}", "Back to your table": "回到你的牌桌", "Quick match": "快速匹配", "buy-in {n}": "买入 {n}", "Open tables": "公开牌桌", "{n} people": "{n} 人", "playing": "进行中", "Watch": "观战", "Join": "加入", "No open tables right now — start one with Quick match": "现在没有公开牌桌——用快速匹配开一桌吧", "Create": "创建", "6-digit code": "6 位代码", "Finish 3 solo games": "完成 3 局单人游戏", "Play 20 table hands": "在牌桌上玩 20 手", "Once a day each · never for winning — the chips are play money": "每项每天一次 · 与输赢无关——筹码只是游戏币", "Sign in with a wallet to earn ARCL from the daily missions": "用钱包登录即可通过每日任务赚取 ARCL", "Chips are free every day and can't be bought, sold or turned into ARCL.": "筹码每天免费，不能购买、出售或兑换成 ARCL。", "This week's most chips won at the tables": "本周牌桌赢得筹码最多", "No one on the board yet this week — be the first!": "本周还没有人上榜——来当第一名吧！", "Games": "局数", "Win rate": "胜率", "Table hands": "牌桌手数", "Card backs": "牌背", "Table felt": "桌布", "Poker XP: +{a} a finished game (a table game is 10 hands), up to {b} a day": "扑克经验：每完成一局 +{a}（牌桌每 10 手算一局），每天最多 {b}", "Everyone gets two cards; five shared cards come in the middle (3, then 1, then 1).": "每人发两张牌；中间依次发出五张公共牌（3 张、1 张、1 张）。", "Make the best five-card hand from your two and the five shared.": "用你的两张和五张公共牌组成最好的五张牌。", "Each round: check, bet, call, raise or fold. The best hand at the end — or the last one left — wins the pot.": "每一轮：过牌、下注、跟注、加注或弃牌。最后牌最大的人——或最后留下的人——赢得底池。", "ARCIA POKER LOUNGE": "ARCIA 扑克酒廊", "Texas Hold'em with ARCIA · free play chips": "和 ARCIA 一起玩德州扑克 · 免费游戏筹码", "Leave the lounge": "离开酒廊", "Pre-flop": "翻牌前", "Flop": "翻牌", "Turn": "转牌", "River": "河牌", "{name} posts {n}": "{name} 下盲注 {n}", "{name} folds": "{name} 弃牌", "{name} checks": "{name} 过牌", "{name} calls {n}": "{name} 跟注 {n}", "{name} goes all in ({n})": "{name} 全下（{n}）", "{name} raises to {n}": "{name} 加注到 {n}", "Your chance {n}%": "你的胜率 {n}%", "Result": "结果", "Pot": "底池", "Close": "关闭", "Replay": "回放", "+ AI": "+ AI", "Sit down": "入座", "Leave": "离开", "POT": "底池", "Min": "最小", "Reconnecting…": "正在重新连接…", "Leave this game? It won't count.": "离开这局吗？不会计入。", "Stay": "留下", "Opening the lounge…": "正在打开酒廊…", "The lounge couldn't open: {e}": "酒廊无法打开：{e}", "Classic Blue": "经典蓝", "Mint": "薄荷", "Gold": "金色", "Infinity": "无限", "Lounge Violet": "酒廊紫", "Emerald": "祖母绿", "Midnight Blue": "午夜蓝", "Crimson": "绯红", "Rookie": "新手", "Regular": "常客", "Sharp Player": "高手", "High Roller": "豪客", "Lounge Star": "酒廊之星", "ARCIA's Favorite": "ARCIA 的最爱", "Lounge Legend": "酒廊传奇", "Infinity Ace": "无限王牌", "Beginner": "新手", "Normal": "普通", "Hard": "困难", "Expert": "专家", "High Card": "高牌", "One Pair": "一对", "Two Pair": "两对", "Three of a Kind": "三条", "Straight": "顺子", "Flush": "同花", "Full House": "葫芦", "Four of a Kind": "四条", "Straight Flush": "同花顺", "Royal Flush": "皇家同花顺", "Nice hand!": "好牌！", "Good luck!": "祝好运！", "One more?": "再来一局？", "Not enough chips for this table": "筹码不够上这张桌", "That table is full": "那张牌桌满了", "No table with that code": "没有这个代码的牌桌", "Not your turn": "还没轮到你", "Network trouble — try again": "网络有问题——请再试一次"});
Object.assign(LW.tr, {"You": "Sen", "ALL IN": "ALL-IN", "FOLD": "PAS", "CHECK": "KONTROL", "SB": "KB", "BB": "BB", "CALL": "GÖR", "RAISE": "ARTIR", "BET": "BAHİS", "{name}: ALL IN!": "{name}: ALL-IN!", "BIG POT!": "BÜYÜK POT!", "Big pot~! ♡": "Büyük pot~! ♡", "ALL IN — the board runs out": "ALL-IN — masa sonuna kadar açılıyor", "All in! Here comes the board~": "All-in! İşte masa kartları geliyor~", "ARCIA JACKPOT!": "ARCIA JACKPOT!", "ROYAL FLUSH": "FLOŞ ROYAL", "A royal flush?! ARCIA JACKPOT! 💙💚": "Floş royal mı?! ARCIA JACKPOT! 💙💚", "SPLIT POT": "POT BÖLÜNDÜ", "YOU WIN": "KAZANDIN", "What a comeback! ♾️": "Ne geri dönüş! ♾️", "Nice hand~ ♡": "Güzel el~ ♡", "{name} wins": "{name} kazandı", "Everyone else folded": "Diğer herkes pas geçti", "Open seat": "Boş koltuk", "Away": "Uzakta", "Sitting out": "Oyun dışı", "Folded": "Pas geçildi", "Your turn~ Call, raise or fold? ♡": "Sıra sende~ Gör, artır ya da pas? ♡", "RAISE TO": "ARTIR", "Watching · tap Sit down to play": "İzliyorsun · oynamak için Otur'a dokun", "You're out of chips at this table": "Bu masada fişin bitti", "Waiting for players… ({n}/6)": "Oyuncular bekleniyor… ({n}/6)", "The next hand starts soon…": "Sonraki el birazdan başlıyor…", "You're in from the next hand": "Bir sonraki elden itibaren oyundasın", "Private table": "Özel masa", "Table": "Masa", "Solo · {lvl}": "Solo · {lvl}", "Code {c}": "Kod {c}", "Hand #{n}": "El #{n}", "Hand {n} / {m} · Blinds {b}": "El {n} / {m} · Kör bahis {b}", "That move isn't allowed": "Bu hamleye izin yok", "That move didn't go through: {e}": "Hamle iletilemedi: {e}", "Are you sure? ♡ Go all in~?": "Emin misin? ♡ All-in mi~?", "Cancel": "Vazgeç", "Blinds up: {b}": "Kör bahis arttı: {b}", "YOU WIN THE GAME!": "OYUNU KAZANDIN!", "GAME OVER": "OYUN BİTTİ", "What a game~ You're a natural! ♡": "Ne oyundu~ Doğuştan yeteneklisin! ♡", "Good game~ ♡ One more?": "İyi oyundu~ ♡ Bir tane daha?", "Hands": "El", "Chips": "Fiş", "Best hand": "En iyi el", "Sending your game…": "Oyunun gönderiliyor…", "Guest play: sign in to count missions and earn ARCL": "Misafir oyunu: görevlerin sayılması ve ARCL için giriş yap", "Lounge": "Salon", "Play again": "Tekrar oyna", "This game couldn't be counted — try again later": "Bu oyun sayılamadı — sonra tekrar dene", "Too quick to count — a game needs at least 20 seconds": "Sayılmak için çok hızlı — bir oyun en az 20 saniye sürmeli", "poker XP": "poker XP", "Today's poker XP is full": "Bugünün poker XP'si doldu", "Solo games today: {n}/{m}": "Bugünkü solo oyunlar: {n}/{m}", "Mission complete!": "Görev tamam!", "Two down, one to go~ Today's mission is almost yours! 💙💚": "İkisi bitti, biri kaldı~ Bugünün görevi neredeyse senin! 💙💚", "LEVEL UP!": "SEVİYE ATLADIN!", "Unlocked: {x}": "Açıldı: {x}", "Sign in with a wallet to play at the tables": "Masalarda oynamak için cüzdanla giriş yap", "Private table · code {c} — share it with friends": "Özel masa · kod {c} — arkadaşlarınla paylaş", "Mission complete: 20 table hands": "Görev tamam: 20 masa eli", "That table has closed": "O masa kapandı", "Couldn't leave the table cleanly: {e}": "Masadan düzgün ayrılamadın: {e}", "A table code is 6 digits": "Masa kodu 6 hanelidir", "Let's play together~ ♡": "Hadi birlikte oynayalım~ ♡", "Play": "Oyna", "Missions": "Görevler", "Ranking": "Sıralama", "Profile": "Profil", "How to play": "Nasıl oynanır", "SOLO": "SOLO", "{n} hands · {c} chips each · blinds rise every 4 hands": "{n} el · herkese {c} fiş · kör bahis her 4 elde artar", "AI players": "AI oyuncular", "Level": "Seviye", "PLAY SOLO": "SOLO OYNA", "MULTIPLAYER": "ÇOK OYUNCULU", "2–6 players at a real table": "Gerçek masada 2–6 oyuncu", "Your chips: {n}": "Fişlerin: {n}", "free {n} a day": "günde {n} ücretsiz", "Back to your table": "Masana dön", "Quick match": "Hızlı eşleşme", "buy-in {n}": "giriş {n}", "Open tables": "Açık masalar", "{n} people": "{n} kişi", "playing": "oyunda", "Watch": "İzle", "Join": "Katıl", "No open tables right now — start one with Quick match": "Şu an açık masa yok — Hızlı eşleşme ile bir tane başlat", "Create": "Oluştur", "6-digit code": "6 haneli kod", "Finish 3 solo games": "3 solo oyun bitir", "Play 20 table hands": "Masada 20 el oyna", "Once a day each · never for winning — the chips are play money": "Her biri günde bir kez · asla kazanmak için değil — fişler oyun parası", "Sign in with a wallet to earn ARCL from the daily missions": "Günlük görevlerden ARCL kazanmak için cüzdanla giriş yap", "Chips are free every day and can't be bought, sold or turned into ARCL.": "Fişler her gün ücretsizdir; satın alınamaz, satılamaz ve ARCL'ye çevrilemez.", "This week's most chips won at the tables": "Bu hafta masalarda en çok fiş kazananlar", "No one on the board yet this week — be the first!": "Bu hafta tabloda henüz kimse yok — ilk sen ol!", "Games": "Oyunlar", "Win rate": "Kazanma oranı", "Table hands": "Masa elleri", "Card backs": "Kart arkaları", "Table felt": "Masa çuhası", "Poker XP: +{a} a finished game (a table game is 10 hands), up to {b} a day": "Poker XP: biten oyun başına +{a} (masada 10 el bir oyun), günde en fazla {b}", "Everyone gets two cards; five shared cards come in the middle (3, then 1, then 1).": "Herkes iki kart alır; ortaya beş ortak kart gelir (3, sonra 1, sonra 1).", "Make the best five-card hand from your two and the five shared.": "Kendi iki kartın ve beş ortak karttan en iyi beşli eli yap.", "Each round: check, bet, call, raise or fold. The best hand at the end — or the last one left — wins the pot.": "Her turda: kontrol, bahis, gör, artır ya da pas. Sonunda en iyi el — ya da son kalan — potu kazanır.", "ARCIA POKER LOUNGE": "ARCIA POKER SALONU", "Texas Hold'em with ARCIA · free play chips": "ARCIA ile Texas Hold'em · ücretsiz oyun fişleri", "Leave the lounge": "Salondan çık", "Pre-flop": "Flop öncesi", "Flop": "Flop", "Turn": "Turn", "River": "River", "{name} posts {n}": "{name} {n} kör bahis koydu", "{name} folds": "{name} pas geçti", "{name} checks": "{name} kontrol etti", "{name} calls {n}": "{name} {n} gördü", "{name} goes all in ({n})": "{name} all-in ({n})", "{name} raises to {n}": "{name} {n}'e artırdı", "Your chance {n}%": "Şansın %{n}", "Result": "Sonuç", "Pot": "Pot", "Close": "Kapat", "Replay": "Tekrar izle", "+ AI": "+ AI", "Sit down": "Otur", "Leave": "Ayrıl", "POT": "POT", "Min": "En az", "Reconnecting…": "Yeniden bağlanıyor…", "Leave this game? It won't count.": "Bu oyundan çıkılsın mı? Sayılmayacak.", "Stay": "Kal", "Opening the lounge…": "Salon açılıyor…", "The lounge couldn't open: {e}": "Salon açılamadı: {e}", "Classic Blue": "Klasik Mavi", "Mint": "Nane", "Gold": "Altın", "Infinity": "Sonsuzluk", "Lounge Violet": "Salon Moru", "Emerald": "Zümrüt", "Midnight Blue": "Gece Mavisi", "Crimson": "Kızıl", "Rookie": "Çaylak", "Regular": "Müdavim", "Sharp Player": "Keskin Oyuncu", "High Roller": "Büyük Oyuncu", "Lounge Star": "Salon Yıldızı", "ARCIA's Favorite": "ARCIA'nın Gözdesi", "Lounge Legend": "Salon Efsanesi", "Infinity Ace": "Sonsuzluk Ası", "Beginner": "Acemi", "Normal": "Normal", "Hard": "Zor", "Expert": "Uzman", "High Card": "Yüksek Kart", "One Pair": "Bir Çift", "Two Pair": "İki Çift", "Three of a Kind": "Üçlü", "Straight": "Kent", "Flush": "Renk", "Full House": "Full House", "Four of a Kind": "Kare", "Straight Flush": "Renk Kent", "Royal Flush": "Floş Royal", "Nice hand!": "Güzel el!", "Good luck!": "Bol şans!", "One more?": "Bir tane daha?", "Not enough chips for this table": "Bu masa için yeterli fişin yok", "That table is full": "O masa dolu", "No table with that code": "Bu kodla bir masa yok", "Not your turn": "Sıra sende değil", "Network trouble — try again": "Ağ sorunu — tekrar dene"});
Object.assign(LW.ko, {"Strong": "강함", "Good": "괜찮음", "Weak": "약함", "Settings": "설정", "Hand strength hint": "핸드 강도 힌트", "On": "켜짐", "Off": "꺼짐", "Vibration": "진동", "Out of chips~ ♡ One more go?": "칩이 다 떨어졌어요~ ♡ 한 번 더 해볼까요?", "Rebuy {n} chips (once a game)": "칩 {n}개 리바이 (게임당 1번)", "End the game": "게임 끝내기", "Rebuy": "리바이", "Rebuy: +{n}": "리바이: +{n}", "Rebuy used": "리바이 사용"});
Object.assign(LW.zh, {"Strong": "强", "Good": "不错", "Weak": "弱", "Settings": "设置", "Hand strength hint": "牌力提示", "On": "开", "Off": "关", "Vibration": "振动", "Out of chips~ ♡ One more go?": "筹码用完啦~ ♡ 再来一次？", "Rebuy {n} chips (once a game)": "重新买入 {n} 筹码（每局一次）", "End the game": "结束本局", "Rebuy": "重新买入", "Rebuy: +{n}": "重新买入：+{n}", "Rebuy used": "已重新买入"});
Object.assign(LW.tr, {"Strong": "Güçlü", "Good": "İyi", "Weak": "Zayıf", "Settings": "Ayarlar", "Hand strength hint": "El gücü ipucu", "On": "Açık", "Off": "Kapalı", "Vibration": "Titreşim", "Out of chips~ ♡ One more go?": "Fişin bitti~ ♡ Bir şans daha?", "Rebuy {n} chips (once a game)": "{n} fiş yeniden al (oyun başına bir kez)", "End the game": "Oyunu bitir", "Rebuy": "Yeniden al", "Rebuy: +{n}": "Yeniden alım: +{n}", "Rebuy used": "Yeniden alım kullanıldı"});
Object.assign(LW.ko, {"Clear": "지우기", "Rebet": "같은 베팅", "DEAL": "딜", "Free refill to {n}": "{n}칩 무료 충전", "HIT": "히트", "STAND": "스탠드", "DOUBLE": "더블", "SPLIT": "스플릿", "SURRENDER": "서렌더", "Blackjack · vs ARCIA": "블랙잭 · vs ARCIA", "Bank {b} · Bet {n}": "보유 {b} · 베팅 {n}", "ARCIA's tip: {m} ♡": "ARCIA의 팁: {m} ♡", "BLACKJACK!": "블랙잭!", "WIN": "승리", "PUSH": "무승부", "BUST": "버스트", "LOSE": "패배", "ARCIA": "ARCIA", "Refilled: {n} chips": "충전 완료: {n}칩", "Surrendered: half back": "서렌더: 절반 돌려받음", "A fresh shoe": "새 슈로 교체", "Insurance? ♡": "인슈어런스? ♡", "ARCIA shows an ace~ Insurance? ♡": "ARCIA 카드가 에이스예요~ 인슈어런스 할까요? ♡", "Costs {n} · pays 2 to 1 if ARCIA has blackjack": "비용 {n} · ARCIA가 블랙잭이면 2배 지급", "No thanks": "괜찮아요", "Insure": "인슈어런스", "Blackjack! ♾️": "블랙잭! ♾️", "No blackjack — insurance lost": "블랙잭 아님 — 인슈어런스는 잃었어요", "ARCIA BUSTS!": "ARCIA 버스트!", "Oops~ I busted! ♡": "앗~ 제가 버스트했어요! ♡", "{n} in a row~! You're on fire ♡": "{n}연승~! 불타오르네요 ♡", "Your bet comes back": "베팅금이 돌아와요", "ARCIA has blackjack": "ARCIA 블랙잭", "ARCIA wins": "ARCIA 승리", "Unlucky~ the next one's yours ♡": "아쉬워요~ 다음 판은 당신 거예요 ♡", "Insurance pays {n}": "인슈어런스 지급 {n}", "Out of chips~ Free refill below ♡": "칩이 떨어졌어요~ 아래에서 무료 충전 ♡", "Mission complete: 30 blackjack hands": "미션 완료: 블랙잭 30핸드", "Place your bet~ ♡": "베팅해 주세요~ ♡", "BLACKJACK": "블랙잭", "vs ARCIA · free {n} chips · blackjack pays 3 to 2": "vs ARCIA · 무료 {n}칩 · 블랙잭 3:2 지급", "PLAY BLACKJACK": "블랙잭 플레이", "Play 30 blackjack hands": "블랙잭 30핸드 플레이", "Blackjack hands": "블랙잭 핸드", "Blackjacks": "블랙잭 횟수", "Hit": "히트", "Stand": "스탠드", "Double": "더블", "Split": "스플릿", "Surrender": "서렌더"});
Object.assign(LW.zh, {"Clear": "清除", "Rebet": "重复下注", "DEAL": "发牌", "Free refill to {n}": "免费补充到 {n}", "HIT": "要牌", "STAND": "停牌", "DOUBLE": "加倍", "SPLIT": "分牌", "SURRENDER": "投降", "Blackjack · vs ARCIA": "二十一点 · 对战 ARCIA", "Bank {b} · Bet {n}": "筹码 {b} · 下注 {n}", "ARCIA's tip: {m} ♡": "ARCIA 的建议：{m} ♡", "BLACKJACK!": "二十一点！", "WIN": "赢", "PUSH": "平局", "BUST": "爆牌", "LOSE": "输", "ARCIA": "ARCIA", "Refilled: {n} chips": "已补充：{n} 筹码", "Surrendered: half back": "投降：退还一半", "A fresh shoe": "换新牌靴", "Insurance? ♡": "要买保险吗？♡", "ARCIA shows an ace~ Insurance? ♡": "ARCIA 明牌是 A~ 要买保险吗？♡", "Costs {n} · pays 2 to 1 if ARCIA has blackjack": "花费 {n} · ARCIA 是二十一点则 2 赔 1", "No thanks": "不用了", "Insure": "买保险", "Blackjack! ♾️": "二十一点！♾️", "No blackjack — insurance lost": "不是二十一点——保险输了", "ARCIA BUSTS!": "ARCIA 爆牌！", "Oops~ I busted! ♡": "哎呀~ 我爆牌了！♡", "{n} in a row~! You're on fire ♡": "连赢 {n} 把~！手感火热 ♡", "Your bet comes back": "下注退回", "ARCIA has blackjack": "ARCIA 是二十一点", "ARCIA wins": "ARCIA 赢了", "Unlucky~ the next one's yours ♡": "可惜~ 下一把是你的 ♡", "Insurance pays {n}": "保险赔付 {n}", "Out of chips~ Free refill below ♡": "筹码用完了~ 下方免费补充 ♡", "Mission complete: 30 blackjack hands": "任务完成：二十一点 30 手", "Place your bet~ ♡": "请下注~ ♡", "BLACKJACK": "二十一点", "vs ARCIA · free {n} chips · blackjack pays 3 to 2": "对战 ARCIA · 免费 {n} 筹码 · 二十一点 3 赔 2", "PLAY BLACKJACK": "开始二十一点", "Play 30 blackjack hands": "玩 30 手二十一点", "Blackjack hands": "二十一点手数", "Blackjacks": "二十一点次数", "Hit": "要牌", "Stand": "停牌", "Double": "加倍", "Split": "分牌", "Surrender": "投降"});
Object.assign(LW.tr, {"Clear": "Temizle", "Rebet": "Aynı bahis", "DEAL": "DAĞIT", "Free refill to {n}": "{n} fişe ücretsiz doldur", "HIT": "KART", "STAND": "DUR", "DOUBLE": "İKİYE KATLA", "SPLIT": "BÖL", "SURRENDER": "TESLİM", "Blackjack · vs ARCIA": "Blackjack · ARCIA'ya karşı", "Bank {b} · Bet {n}": "Kasa {b} · Bahis {n}", "ARCIA's tip: {m} ♡": "ARCIA'nın ipucu: {m} ♡", "BLACKJACK!": "BLACKJACK!", "WIN": "KAZAN", "PUSH": "BERABERE", "BUST": "BATTI", "LOSE": "KAYBET", "ARCIA": "ARCIA", "Refilled: {n} chips": "Dolduruldu: {n} fiş", "Surrendered: half back": "Teslim: yarısı geri", "A fresh shoe": "Yeni deste kutusu", "Insurance? ♡": "Sigorta? ♡", "ARCIA shows an ace~ Insurance? ♡": "ARCIA'nın açık kartı as~ Sigorta? ♡", "Costs {n} · pays 2 to 1 if ARCIA has blackjack": "Bedeli {n} · ARCIA blackjack yaparsa 2'ye 1 öder", "No thanks": "Hayır, teşekkürler", "Insure": "Sigorta yap", "Blackjack! ♾️": "Blackjack! ♾️", "No blackjack — insurance lost": "Blackjack yok — sigorta kaybedildi", "ARCIA BUSTS!": "ARCIA BATTI!", "Oops~ I busted! ♡": "Eyvah~ Battım! ♡", "{n} in a row~! You're on fire ♡": "Üst üste {n}~! Alev alevsin ♡", "Your bet comes back": "Bahsin geri döner", "ARCIA has blackjack": "ARCIA'da blackjack var", "ARCIA wins": "ARCIA kazandı", "Unlucky~ the next one's yours ♡": "Şanssızlık~ sıradaki senin ♡", "Insurance pays {n}": "Sigorta {n} ödüyor", "Out of chips~ Free refill below ♡": "Fişin bitti~ Aşağıdan ücretsiz doldur ♡", "Mission complete: 30 blackjack hands": "Görev tamam: 30 blackjack eli", "Place your bet~ ♡": "Bahsini koy~ ♡", "BLACKJACK": "BLACKJACK", "vs ARCIA · free {n} chips · blackjack pays 3 to 2": "ARCIA'ya karşı · ücretsiz {n} fiş · blackjack 3'e 2 öder", "PLAY BLACKJACK": "BLACKJACK OYNA", "Play 30 blackjack hands": "30 blackjack eli oyna", "Blackjack hands": "Blackjack elleri", "Blackjacks": "Blackjack sayısı", "Hit": "Kart al", "Stand": "Dur", "Double": "İkiye katla", "Split": "Böl", "Surrender": "Teslim ol"});
Object.assign(LW.ko, {"Blackjack hands can't be counted right now — the mission waits": "지금은 블랙잭 핸드가 집계되지 않아요 — 미션은 나중에 이어져요"});
Object.assign(LW.zh, {"Blackjack hands can't be counted right now — the mission waits": "现在无法统计二十一点手数——任务稍后继续"});
Object.assign(LW.tr, {"Blackjack hands can't be counted right now — the mission waits": "Blackjack elleri şu an sayılamıyor — görev bekliyor"});
