// world-poker.js — ARCIA POKER LOUNGE, the Game Village's Texas Hold'em (loaded the first time the lounge door is used,
// like INFINITY RINGS). It draws its own scene through the stage's view() while the town waits, frozen, behind it:
// an oval felt table under a warm light, ARCIA dealing from behind it, cards and chips that slide and flip.
// Solo: you and 1–5 computer players (Beginner … Expert), 1,500 chips each, 12 hands, blinds rising every 4 hands —
// the game runs here with world-poker-engine.js. At the tables (a wallet): 2–6 people and computer players, dealt and
// timed by the server (api/_world-poker.mjs), which this page asks for the table about once a second.
// Blackjack against ARCIA plays at the same table (world-blackjack.js).
// Chips (a wallet's, kept by the server): free every day, or bought with ARCL in the chip shop — one way only, chips
// never turn back into ARCL. The tables and blackjack play them; solo poker is practice. The lounge's ARCL rewards
// are its daily missions (finish 3 solo games · play 20 table hands · play 30 blackjack hands), never for winning.
//
// b-pky3: the last 20 hands kept on this device (replay and share any of them), your counts and badges (the server's
// for a wallet; table hands are counted there), the daily rule (a solo game with today's twist and its own board), a
// 3-hand tutorial with ARCIA coaching, card backs and felts for chips, the computers' styles (and a word now and
// then), crew tables, and the solo game's result cards.
//
// ctx: { THREE, K, st, ver, T, lang, esc, toast, Snd, reduce, low, coarse, sess, post, quality, name(), refresh(),
//        gain(n, why), onLeave() }
import { POKER, HANDS, LEVELS, newHand, act, legal, pot, botMove, best, equity, RANKS, SUITS, rankOf, suitOf, handStats, addStats, badgesOf, BADGES, ruleOf, STYLE_OF } from "./world-poker-engine.js";
import { BJ } from "./world-blackjack-engine.js";
import { makeBlackjack } from "./world-blackjack.js";
import { makeLounge, EMOTE } from "./world-poker-room.js";

const SAVE = "arc.world.poker", ROOMK = "arc.world.poker.room", HISTK = "arc.world.poker.hist", fmt = (n) => Math.round(n || 0).toLocaleString("en-US");
const seoulDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const BOTS = ["AI ARON", "AI LUMI", "AI NEX", "AI ARC", "AI MINT"];
const BOT_LOOK = [["custom-aron", 0], ["custom-lumi", 0], ["custom-nex", 0], ["custom-aron", 3], ["custom-lumi", 1]]; // (api/_world-poker.mjs gives the tables' computer players the same)
const botLook = (name) => { const k = Math.max(0, BOTS.indexOf(name)); return { ch: BOT_LOOK[k][0], tn: BOT_LOOK[k][1] }; };
const AVC = ["#2f86ff", "#ff6fb5", "#2ee0b0", "#ffd23a", "#a77bff", "#ff8a3d"];
// the seats round the table, by where they're drawn: 0 is you (the bottom), then clockwise — the order of play
const SLOT = [90, 150, 210, 270, 330, 30], LAYOUT = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 2, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
const RX = 3.0, RZ = 3.9, CW = 0.62, CH = 0.87;
const DZ = -RZ - 2.2, DY = 0.45; // ARCIA stands back from the far end (b-pk3d: a hero sits there now), a little raised
const BACKS = [{ id: "blue", lv: 1, a: "#1d4fd6", b: "#62a8ff", name: "Classic Blue" }, { id: "mint", lv: 5, a: "#0b7a63", b: "#5ff0d0", name: "Mint" }, { id: "gold", lv: 10, a: "#6b3f00", b: "#ffd23a", name: "Gold" }, { id: "inf", lv: 20, a: "#2a1260", b: "#b48cff", name: "Infinity" }, { id: "night", lv: 1, need: "back:night", a: "#0b1030", b: "#ffd23a", name: "Opening Night" },
  { id: "ruby", lv: 1, need: "back:ruby", a: "#5a0618", b: "#ff4d6d", name: "Ruby" }, { id: "neon", lv: 1, need: "back:neon", a: "#04263a", b: "#00f0ff", name: "Neon" }, { id: "galaxy", lv: 1, need: "back:galaxy", a: "#120a3a", b: "#ff8af0", name: "Galaxy" }]; // (b-pky3: the last three for chips, POKER.SHOP)
const FELTS = [{ id: "violet", lv: 1, a: "#6a3cc0", b: "#1e0c44", name: "Lounge Violet" }, { id: "emerald", lv: 3, a: "#169a6e", b: "#04382a", name: "Emerald" }, { id: "navy", lv: 8, a: "#2a62c8", b: "#0a1a48", name: "Midnight Blue" }, { id: "crimson", lv: 15, a: "#b42a4c", b: "#3a0716", name: "Crimson" }, { id: "champ", lv: 1, need: "felt:champ", a: "#e0b040", b: "#4a2c00", name: "Champion Gold" },
  { id: "ocean", lv: 1, need: "felt:ocean", a: "#1aa0c8", b: "#03243a", name: "Ocean" }, { id: "sakura", lv: 1, need: "felt:sakura", a: "#e07aa6", b: "#4a1030", name: "Sakura" }, { id: "royal", lv: 1, need: "felt:royal", a: "#2b2bd8", b: "#0a0838", name: "Royal Blue" }];
const priceOf = (b) => { const it = b.need && POKER.SHOP.find((x) => x.id === b.need); return it ? it.chips : 0; };
// b-pky3: what the computers say now and then, by their style (engine STYLE_OF)
const LINES = { aggr: ["Pressure's on! 🔥", "Too slow~", "Raise it up!"], bluff: ["Do I have it? 😏", "Read me if you can~", "Feeling lucky…"], tight: ["Only the good ones.", "I've got something.", "Careful now~"], loose: ["I'll call that!", "Why not~", "Let's see it!"], calm: ["Fair bet.", "Let's play."] };
const RULE_TXT = { double: "Blinds start at 20/40", deep: "3,000 chips each", turbo: "Blinds double every 2 hands", duel: "You vs AI NEX at Expert", allstar: "5 AI players at Hard" };
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
// b-pky: a solo game's length (hands) and how often its blinds rise; the server takes 1–40 hands
const LENS = [6, 12, 24], riseOf = (n) => (n <= 6 ? 2 : n >= 24 ? 6 : 4), lenOf = (p) => (LENS.includes(p && p.len) ? p.len : POKER.SOLO_HANDS);
/// b-pky: what your cards are drawing to (the board not complete): a flush draw, an open-ended or a gutshot straight draw, with its outs
function drawsOf(hole, board) {
  if (board.length < 3 || board.length >= 5) return ""; const all = [...hole, ...board], suits = [0, 0, 0, 0]; for (const c of all) suits[suitOf(c)]++;
  const made = best(all); if (made.cat >= 5) return ""; // (a straight or better made already)
  const fd = suits.some((n) => n === 4) && hole.some((c) => suits[suitOf(c)] === 4);
  const rs = new Set(all.map(rankOf)); if (rs.has(12)) rs.add(-1); let oe = false, gs = false; // (rank -1: the ace played low)
  for (let lo = -1; lo <= 9; lo++) { if ([0, 1, 2, 3].every((k) => rs.has(lo + k)) && lo - 1 >= -1 && lo + 4 <= 12 && !rs.has(lo - 1) && !rs.has(lo + 4)) oe = true; } // four in a row, open at both ends
  if (!oe) for (let lo = -1; lo <= 8; lo++) if ([0, 1, 2, 3, 4].filter((k) => rs.has(lo + k)).length === 4) gs = true; // four of five with one gap
  if (fd && (oe || gs)) return "Flush + straight draw · {n} outs:" + (oe ? 15 : 12);
  if (fd) return "Flush draw · {n} outs:9";
  if (oe) return "Open-ended straight draw · {n} outs:8";
  if (gs) return "Gutshot straight draw · {n} outs:4";
  return "";
}

export function createPoker(ctx) {
  const { THREE, st, esc } = ctx, L0 = LW[ctx.lang] || {};
  const T = (s, v) => { const x = L0[s]; return x != null ? x.replace(/\{(\w+)\}/g, (_, k) => (v && v[k] != null ? v[k] : "")) : ctx.T(s, v); };
  const snd = (k, ...a) => { try { const f = ctx.Snd && ctx.Snd[k]; if (f) f.call(ctx.Snd, ...a); } catch { /* silent */ } };
  const view = () => { const c = st.renderer.domElement, r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width || innerWidth, h: r.height || innerHeight }; };
  const phone = () => document.documentElement.classList.contains("wp-pcphone") || (innerWidth < 700 && innerHeight > innerWidth);
  const signed = () => !!(ctx.sess && ctx.sess());
  let on = false, busy = false, mode = "off", S = null, ui = null, prOrig = 0, tab = "play", fast = 1;
  let prog = load(), status = null, topB = null, roomsL = null, sayT = 0, sngL = null, sngT = 0; // (b-pky2: the Sit & Go card)
  let G = null, R = null, vis = blank(), Q = [], qAt = 0, latest = null, TWN = [], actBusy = false;
  let ruleB = null, crewL = null, lastSolo = {}, repR = null, lineAt = 0; // (b-pky3: today's rule board, your crew's tables, the last solo kind, the replay open)
  let walkUp = false; const wKeys = new Set(), joy = { x: 0, y: 0, id: -1 }; // b-pk3d: walking the room (the lobby with its sheet put away)

  // ---------------- this device's record (a wallet's comes from the server) ----------------
  function load() {
    const d = { xp: 0, day: "", xpToday: 0, games: 0, wins: 0, best: -1, back: "blue", felt: "violet", ais: 3, lvl: 1, hint: true, buzz: true, len: 12, st: {}, tut: false };
    try { return { ...d, ...JSON.parse(localStorage.getItem(SAVE) || "{}") }; } catch { return d; }
  }
  function save() { try { localStorage.setItem(SAVE, JSON.stringify(prog)); } catch { /* kept for this visit */ } }
  // b-pky3: the last 20 hands, this device's (a replay's own record: the cards you saw, the log, the result)
  const histLoad = () => { try { const a = JSON.parse(localStorage.getItem(HISTK) || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
  function histPush(r) { const a = [r, ...histLoad()].slice(0, 20); try { localStorage.setItem(HISTK, JSON.stringify(a)); } catch { /* kept for this visit only */ } }
  const myStats = () => (status && status.st ? status.st : prog.st || {});
  const myBadges = () => (status && status.badges ? status.badges : badgesOf(prog.st));
  const lvInfo = () => (status ? { lv: status.lv, into: status.into, need: status.need } : levelOf(prog.xp));
  const unlockLv = () => Math.max(lvInfo().lv, levelOf(prog.xp).lv);
  /// a look you can't use yet: a level to reach, or an event's prize you haven't won
  const locked = (b, ul) => (b.need ? !(status && (status.unlocks || []).includes(b.need)) : ul < b.lv);
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
    const deal = new THREE.Group(); deal.position.set(0, DY, DZ); scene.add(deal);
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
    // b-pk3d: the room round the table, the chairs and the heroes in them (world-poker-room.js)
    try { S.lounge = makeLounge({ THREE, K: ctx.K, ver: ctx.ver || "", low: !!ctx.low, coarse: !!ctx.coarse, scene, RX, RZ, slotPos }); } catch (e) { console.warn("poker room:", e); S.lounge = null; }
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
    if (walkUp) { cam.aspect = V.w / V.h; cam.fov = phone() ? 56 : 46; cam.updateProjectionMatrix(); cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert(); S.p9 = cam.projectionMatrix.elements[9]; S.key = [V.w, V.h, mode, walkUp].join("x"); return; } // (the camera follows you: tick)
    const top = (lob ? 30 : phone() ? 70 : 60) * k, bot = lob ? V.h * 0.6 : (phone() ? 244 : wide() ? 18 : 212) * k; // (b-pky: room for the one-tap bets under your cards) // (wide: your cards and moves sit at the side)
    cam.aspect = V.w / V.h; cam.fov = phone() ? 40 : 34;
    const el = ((lob ? 26 : phone() ? 54 : 46) * Math.PI) / 180, tz = lob ? -RZ * 0.6 : 0.1; // (b-pk3d: lower than before, so the heroes in the chairs show)
    const pts = lob ? [[-(RX + 0.6), 0, -RZ * 0.4], [RX + 0.6, 0, -RZ * 0.4], [0, 4.3 + DY, DZ], [0, 0, -RZ * 0.1]] : [[-(RX + 0.5), 0, 0], [RX + 0.5, 0, 0], [0, 0, RZ + 0.5], [0, (phone() ? 3.0 : 3.8) + DY, DZ], [0, 0, -RZ - 0.5], [-(RX + 0.7), 1.5, -RZ * 0.62], [RX + 0.7, 1.5, -RZ * 0.62], [-(RX + 0.7), 0.4, RZ * 0.6], [RX + 0.7, 0.4, RZ * 0.6]]; // (and the heroes' heads in the side chairs)
    const yT = 1 - (2 * top) / V.h, yB = -1 + (2 * bot) / V.h, band = Math.max(0.25, yT - yB);
    const place = (D) => { cam.position.set(0, D * Math.sin(el), tz + D * Math.cos(el)); cam.lookAt(0, lob ? 1.2 : 0, tz); cam.updateProjectionMatrix(); cam.updateMatrixWorld(); let x = 0, y0 = 9, y1 = -9; for (const p of pts) { tv.set(p[0], p[1], p[2]).project(cam); x = Math.max(x, Math.abs(tv.x)); y0 = Math.min(y0, tv.y); y1 = Math.max(y1, tv.y); } return { x, y0, y1 }; };
    let lo = 3, hi = 60; for (let it = 0; it < 22; it++) { const D = (lo + hi) / 2, r = place(D); if (r.x <= 0.97 && r.y1 - r.y0 <= band) hi = D; else lo = D; }
    const b = place(hi), s = (yT + yB) / 2 - (b.y0 + b.y1) / 2;
    cam.projectionMatrix.elements[9] = -s; cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert(); S.p9 = -s;
    S.key = [V.w, V.h, mode, walkUp].join("x");
    S.dlr.parent.lookAt(cam.position.x, S.dlr.parent.position.y + (cam.position.y - S.dlr.parent.position.y) * 0.35, cam.position.z); // (leaning back a little toward the camera)
  }
  const wide = () => !phone() && innerWidth > innerHeight * 1.25;
  const boardScale = () => (phone() ? 1.22 : 1.3); // (b-pky: the board a size up on a phone)
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
    const H = M.hand; vis = { ...blank(), M, handNo: H.handNo, replay: vis.replay, turnSaid: vis.turnSaid }; pre = "";
    vis.bet = H.p.map(() => 0); vis.tot = H.p.map(() => 0);
    vis.start = H.p.map((p, i) => (H.result ? p.stack - H.result.net[i] : p.stack + p.total)); vis.stack = vis.start.slice();
    step(0.3, () => { clearTable(); snd("shuffle"); placeButton(M); if (H.handNo === 1 || Math.random() < 0.18) say(T(H.handNo === 1 ? "Let's play together~ ♡" : "Shuffle up and deal~")); });
    step(0.25 + 0.09 * H.p.filter((p) => !p.out).length * 2, () => dealHoles(M));
  }
  function clearTable() {
    drama(false); if (!S) return; for (const cd of S.cards) { cd.o.visible = false; cd.c = -2; } for (const g of S.bets) stackChips(g, 0); stackChips(S.potG, 0); S.dbtn.visible = false;
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
      vis.badge[i] = { t: T("FOLD"), c: "fold" }; snd("card"); if (S.lounge) S.lounge.react(dOfI(M, i), "fold");
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
      if (e.t === "allin") { if (i !== me) flash(T("{name}: ALL IN!", { name }), "allin"); pulse("allin"); if (S.lounge) S.lounge.react(d, "allin"); if (Math.random() < 0.5) say(T(i === me ? "All in?! So brave~ ♡" : "Ooh, all in~!")); } // b-pky
      if (H.p[i].bot && i !== me && (e.t === "raise" || e.t === "allin" || e.t === "call")) botLine(M, i, e.t); // b-pky3
      if (!vis.big && vis.tot.reduce((a, b) => a + b, 0) >= H.bb * 60) { vis.big = true; flash(T("BIG POT!"), "big"); say(T("Big pot~! ♡")); }
    }
    paintAll();
  }
  /// b-pky3: a computer's word by its style, over its seat (now and then, not every move)
  function botLine(M, i, t) {
    const sty = STYLE_OF[M.hand.p[i].name] || "calm", now = performance.now(); if (now - lineAt < 4000 || Math.random() > 0.35) return;
    if (t === "call" && sty !== "loose") return; if (t !== "call" && sty === "loose") return;
    const el = ui.seats[dOfI(M, i)], b = el && el.querySelector(".pk-say2"); if (!b) return; lineAt = now;
    const list = LINES[sty]; b.textContent = T(list[Math.floor(Math.random() * list.length)]); b.hidden = false; b.classList.remove("go"); void b.offsetWidth; b.classList.add("go");
    clearTimeout(b._t); b._t = setTimeout(() => { b.hidden = true; }, 2400 * fast);
  }
  /// everyone still in shows their cards (an all-in run-out, or the showdown)
  function reveal(M) {
    const H = M.hand, me = mineI(M); if (!H.result || vis.revealed) return; vis.revealed = true;
    for (const sh of H.result.shown) { if (sh.i === me) continue; for (let j = 0; j < 2; j++) { const cd = holeCard(sh.i, j), sp = holeSpot(M, sh.i, j); cd.c = sh.hole[j]; cd.front.material.map = faceTex(sh.hole[j]); cd.front.material.needsUpdate = true; cd.o.visible = true; moveCard(cd, sp.x, sp.z, sp.yaw, true, 0.4, j * 0.12, 0.92); } }
    snd("flip"); if (runFrom(H) >= 0 || boardByLog(H) < 5) { flash(T("ALL IN — the board runs out"), "allin"); say(T("All in! Here comes the board~")); showEq(M); drama(true); }
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
  // b-pky: the run-out's tension (a dark edge round the screen, a heartbeat) until the pot is pushed
  function drama(on) { if (!ui) return; ui.root.classList.toggle("drama", !!on && !ctx.reduce); clearInterval(drama.t); if (on && !ctx.reduce) { const beat = () => { try { if (ctx.Snd && ctx.Snd.svHeart) ctx.Snd.svHeart(); } catch { /* quiet */ } }; beat(); drama.t = setInterval(beat, 900); } }
  function pulse(kind) { if (!ui || ctx.reduce) return; ui.root.classList.remove("pulse-" + kind); void ui.root.offsetWidth; ui.root.classList.add("pulse-" + kind); setTimeout(() => ui && ui.root.classList.remove("pulse-" + kind), 1300); }
  /// b-pky: a big hand's name across the screen (a full house or better at the showdown)
  function cutIn(name, cat) { if (!ui) return; const el = document.createElement("div"); el.className = "pk-cut c" + cat; el.innerHTML = `<i></i><b>${esc(name.toUpperCase())}!</b><i></i>`; ui.root.appendChild(el); setTimeout(() => el.remove(), 2200); snd(cat >= 8 ? "level" : "win"); }
  function onResult(M) {
    const H = M.hand, res = H.result, me = mineI(M); if (!res) return; drama(false);
    collect(M); if (!res.uncontested) { reveal(M); dealBoard(M, 5); }
    vis.eq = null; vis.badge = {};
    const won = H.p.map((p, i) => res.net[i] + vis.tot[i]), potAll = vis.tot.reduce((a, b) => a + b, 0);
    stackChips(S.potG, 0);
    won.forEach((w, i) => { if (w > 0) { flyChips({ x: 0, z: -1.3 }, slotPos(dOfI(M, i), 0.9), w, 0.1); vis.badge[i] = { t: "+" + fmt(w), c: "win" }; if (S.lounge) S.lounge.react(dOfI(M, i), "win"); } });
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
    if (top && !res.uncontested && top.cat >= 6 && top.cat < 9) cutIn(T(top.name), top.cat); // (b-pky: full house, four of a kind, straight flush)
    if (iWonPot(won, me) && potAll >= H.bb * 40 && !(top && top.cat === 9)) setTimeout(goldBurst, 250); // (a big pot: gold sparks)
    if (top && !res.uncontested && top.cat <= 1 && potAll >= H.bb * 30 && Math.random() < 0.6) setTimeout(() => say(T("Won with that?! What nerve~ ♡")), 900);
    if (top && top.cat === 9 && !res.uncontested) { banner(`<b>${esc(T("ARCIA JACKPOT!"))}</b><small>${esc(T("ROYAL FLUSH"))} · ${esc(wName)}</small>`, "jackpot"); confetti(60); goldBurst(); say(T("A royal flush?! ARCIA JACKPOT! 💙💚")); snd("level"); if (top.i === me && me >= 0) royalShare(top.five); }
    else if (iWon) { banner(`<b>${esc(vis.win.size > 1 ? T("SPLIT POT") : T("YOU WIN"))} +${fmt(won[me])}</b>${hand ? `<small>${esc(hand)}</small>` : ""}`, "win"); confetti(potAll >= H.bb * 40 ? 40 : 18); snd("win"); buzz(potAll >= H.bb * 40 ? [40, 50, 90] : [35]);
      say(vis.start[me] < (G ? POKER.START : 0) * 0.4 || vis.start[me] < H.bb * 15 ? T("What a comeback! ♾️") : T("Nice hand~ ♡")); }
    else banner(`<b>${esc(T("{name} wins", { name: wName }))}${vis.win.size > 1 ? " · " + esc(T("SPLIT POT")) : ""}</b><small>${esc(hand || T("Everyone else folded"))}</small>`, "lose");
    if (me >= 0 && !iWon && res.shown.some((x) => x.i === me)) ui.root.querySelector('.pk-seat[data-d="0"]').classList.add("lose");
    // what the hand was, for the replay
    vis.replay = { handNo: H.handNo, sb: H.sb, bb: H.bb, board: H.board.slice(), log: H.log.slice(), names: H.p.map((p) => p.name), mine: me >= 0 ? H.p[me].hole.slice() : null, me, result: res, alive0: H.p.map((p) => !p.out) };
    if (G && me >= 0 && iWon && top && !res.uncontested && top.i === me) { if (top.cat >= G.best) G.bestFive = top.five.slice(); G.best = Math.max(G.best, top.cat); }
    // b-pky3: the hand kept for the history; a solo hand's counts (the server counts a table's)
    if (me >= 0) histPush({ ...vis.replay, at: Date.now(), kind: M.kind, net: res.net[me] || 0, top: top && !res.uncontested ? { i: top.i, name: top.name, cat: top.cat } : null });
    if (G && me >= 0) { const x = handStats(H, me); if (x) { G.st = addStats(G.st, x); if (x.got > ((G.big && G.big.got) || 0)) G.big = { got: x.got, bb: x.big, handNo: H.handNo };
      if (!signed()) { const had = badgesOf(prog.st); prog.st = addStats(prog.st, x); save(); newBadges(had, badgesOf(prog.st)); } } }
    paintAll(); ui.replayB.disabled = false;
  }

  const iWonPot = (won, me) => me >= 0 && won[me] > 0;
  /// b-pky3: a badge just earned (this device's record; a wallet's comes in the server's news)
  function newBadges(had, now) { for (const id of now) if (!had.includes(id)) { const b = BADGES.find((x) => x.id === id); if (b) { setTimeout(() => ctx.toast(`🏅 <b>${esc(T("New badge: {b}", { b: T(b.name) }))}</b>`), 1400); snd("level"); } } }
  /// your royal flush: a button to share it (world-share.js through ctx.share), up for 25 seconds
  function royalShare(five) {
    if (!ctx.share || !ui) return; const prev = ui.root.querySelector(".pk-royal-share"); if (prev) prev.remove();
    const cards = (five || []).slice().sort((a, b) => rankOf(b) - rankOf(a)).map((c) => (RANKS[rankOf(c)] === "T" ? "10" : RANKS[rankOf(c)]) + SUITS[suitOf(c)]).join(" ");
    const b = document.createElement("button"); b.type = "button"; b.className = "pk-royal-share"; b.textContent = "📸 " + T("Share your royal flush"); ui.root.appendChild(b);
    const t = setTimeout(() => b.remove(), 25e3);
    b.addEventListener("click", () => { clearTimeout(t); b.remove(); ctx.share({ kind: "poker", tag: "ARCIA POKER LOUNGE", title: T("ROYAL FLUSH"), sub: cards, accent: "#ffd23a", emoji: "🃏",
      cards: cards.split(" "), badge: "JACKPOT", rows: [[T("Hand"), T("Royal Flush"), "👑"], [T("Cards"), cards, "🃏"], [T("Player"), (ctx.name && ctx.name()) || T("You"), "🙂"], [T("Odds"), "1 : 649,740", "🎲"]],
      text: T("I hit a ROYAL FLUSH at ARCIA POKER LOUNGE! 🃏 {c}", { c: cards }) }); });
  }
  // ---------------- the HUD over the table ----------------
  function paintAll() { if (!ui || !vis.M) return; paintSeats(); paintMine(vis.M); paintBar(); paintWait(); paintTop(); }
  const myLook = () => (ctx.hero ? ctx.hero() : { ch: "", tn: 0 });
  const lookOf = (seat, mine) => (mine ? myLook() : seat.bot ? (seat.ch ? { ch: seat.ch, tn: seat.tn || 0 } : botLook(seat.name)) : { ch: seat.ch || "", tn: seat.tn || 0 });
  function paintSeats() {
    if (mode !== "table") return; // (a count-up finishing under the game-over sheet)
    const M = vis.M, H = M.hand, me0 = M.me >= 0 ? M.me : 0, mp = M.kind === "mp";
    for (let d = 0; d < 6; d++) {
      const el = ui.seats[d], seat = M.seats[(d + me0) % 6], si = (d + me0) % 6, i = H ? H.seatOf.indexOf(si) : -1;
      if (S && S.lounge) S.lounge.seat(d, seat && !(d === 0 && M.me >= 0) ? lookOf(seat, false) : null); // (you aren't drawn in your own chair: your cards are there)
      if (!seat) { el.hidden = !(mp && d !== 0 && !(H && H.street < 4)); el.className = "pk-seat empty"; el.dataset.d = d; el.querySelector(".nm").textContent = T("Open seat"); el.querySelector(".sk").textContent = ""; el.querySelector(".pk-av span").textContent = "+"; el.querySelector(".pk-act").hidden = true; el.querySelector(".pk-shown").hidden = true; el.style.setProperty("--c", "#4a3a7a"); continue; }
      el.hidden = false; el.dataset.d = d;
      const p = i >= 0 ? H.p[i] : null, stk = i >= 0 && vis.stack[i] != null ? vis.stack[i] : seat.stack;
      el.classList.toggle("empty", false); el.classList.toggle("me", d === 0 && M.me >= 0);
      el.classList.toggle("fold", !!(p && p.folded)); el.classList.toggle("out", !p || p.out); el.classList.toggle("allin", !!(p && p.allin && !p.folded));
      el.classList.toggle("win", !!(vis.win && vis.win.has(i))); el.classList.toggle("away", !!(seat.away || seat.sit));
      el.style.setProperty("--c", AVC[si % AVC.length]);
      el.querySelector(".nm").textContent = seat.name || "";
      el.querySelector(".sk").textContent = fmt(stk);
      el.querySelector(".pk-av span").textContent = (seat.name || "?").replace(/^AI /, "").slice(0, 1).toUpperCase();
      { const lk = lookOf(seat, d === 0 && M.me >= 0), av = el.querySelector(".pk-av"), pic = lk && /^[a-z0-9-]+$/.test(lk.ch || "") ? `models/world/chars/${lk.ch}.webp?v=1` : ""; // b-pky: the hero's face, not a robot emoji
        if (av.dataset.pic !== pic) { av.dataset.pic = pic; av.classList.toggle("pic", !!pic); av.style.setProperty("--pic", pic ? `url("${pic}")` : "none"); } }
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
    { const dr = H.p[me].folded || hole[0] < 0 ? "" : drawsOf(hole, board), [t0, n0] = dr.split(":"); ui.hdesc.textContent = dr ? T(t0, { n: n0 }) : ""; ui.hdesc.hidden = !dr; } // b-pky: what you're drawing to
    ui.eq.textContent = vis.eq && vis.eq[me] != null ? Math.round(vis.eq[me] * 100) + "%" : "";
    // the hint: how often these cards win against the hands still in (random ones), worked out once a street
    const live = H.p.filter((p, i) => i !== me && !p.folded && !p.out).length, showStr = (prog.hint || (G && G.tut)) && H.street < 4 && !H.p[me].folded && hole[0] >= 0 && live > 0 && !vis.eq;
    ui.str.hidden = !showStr || vis.str == null;
    if (showStr) {
      const key = H.handNo + ":" + board.length + ":" + live;
      if (vis.strKey !== key) { vis.strKey = key; vis.str = null; ui.str.hidden = true; setTimeout(() => { if (vis.strKey !== key || !ui) return; try { vis.str = equity(hole, board, live, ctx.low ? 120 : 220, Math.random); } catch { vis.str = null; } if (vis.M) { paintMine(vis.M); if (G && G.tut && myTurn(vis.M)) paintBar(); } }, 30); }
      else if (vis.str != null) { const e = vis.str, c = e >= 0.6 ? "hi" : e >= 0.35 ? "mid" : "lo"; ui.str.className = "pk-str " + c; ui.str.querySelector("i").style.width = Math.round(e * 100) + "%"; ui.str.querySelector("b").textContent = T(c === "hi" ? "Strong" : c === "mid" ? "Good" : "Weak") + " · ≈" + Math.round(e * 100) + "%"; }
    }
  }
  const myTurn = (M) => { const H = M && M.hand; return !!(H && H.street < 4 && H.mine >= 0 && H.toAct === H.mine && !Q.length && !latest); };
  function paintBar() {
    const M = vis.M, turn = mode === "table" && myTurn(M) && !actBusy;
    ui.bar.hidden = !turn; paintPre(); if (!turn) { ui.raise.hidden = true; ui.qb.hidden = true; return; }
    const H = M.hand, L = legal(H), P0 = pot(H);
    // b-pky: one-tap bets (½, ⅔, a pot), their amounts under them
    ui.qb.hidden = !L.raise; if (L.raise) { const seen = new Set(); ui.qb.querySelectorAll("[data-qb]").forEach((b) => { const v = qbTo(H, L, +b.dataset.qb); b.hidden = seen.has(v); seen.add(v); b.querySelector("small").textContent = v >= L.raise.max ? T("ALL IN") : fmt(v); }); } // (two that come to the same amount: one button)
    ui.b.fold.hidden = L.check; ui.b.call.innerHTML = L.check ? `<b>${esc(T("CHECK"))}</b>` : `<b>${esc(T("CALL"))}</b><small>${fmt(L.toCall)}</small>`;
    ui.b.call.classList.toggle("allin", !L.check && L.toCall >= H.p[H.mine].stack);
    ui.b.raise.hidden = !L.raise; ui.b.raise.innerHTML = `<b>${esc(H.curBet > 0 ? T("RAISE") : T("BET"))}</b>`;
    ui.b.allin.hidden = !L.allin || (!L.check && L.toCall >= H.p[H.mine].stack);
    if (L.raise) { const r = ui.raise.querySelector("input"); r.min = L.raise.min; r.max = L.raise.max; r.step = Math.max(1, H.bb / 2); if (!(+r.value >= L.raise.min && +r.value <= L.raise.max)) r.value = L.raise.min; paintRaise(); }
    if (G && G.tut) coach(H, L);
    else if (vis.turnSaid !== H.handNo && (vis.turnSaid === 0 || H.handNo % 5 === 0)) { vis.turnSaid = H.handNo; say(T("Your turn~ Call, raise or fold? ♡")); }
    void P0;
  }
  /// b-pky3: the tutorial: ARCIA says what's going on and which button she'd press (lit), once a street
  function coach(H, L) {
    const key = H.handNo + ":" + H.street + ":" + (vis.str == null ? "?" : "s"); ui.bar.querySelectorAll("button").forEach((b) => b.classList.remove("coach"));
    const e = vis.str, pick = e == null ? "" : e >= 0.6 && L.raise ? "raise" : e >= 0.35 || L.check ? "call" : "fold";
    if (pick) ui.b[pick].classList.add("coach");
    if (G.coach === key) return; G.coach = key;
    const t = H.handNo === 1 && H.street === 0 ? T("These two cards are yours~ Five shared cards come to the middle. Make the best five! ♡")
      : H.handNo === 1 && H.street === 1 ? T("The flop: three shared cards. The bar under your cards shows your chance~")
      : e == null ? T("Your turn~ Let me look at your cards…")
      : pick === "raise" ? T("Strong hand~ Bet or raise to win more! ♡") : pick === "call" ? (L.check ? T("Not bad~ Check: it's free to see more.") : T("Decent~ A call is fine here.")) : T("Weak… folding is fine here. There's always the next hand~");
    say(t, 7000);
  }
  const qbTo = (H, L, k) => Math.max(L.raise.min, Math.min(L.raise.max, Math.round((H.curBet + (pot(H) + L.toCall) * k) / H.bb) * H.bb));
  // b-pky: your move picked before your turn (check/fold, call any, check), done the moment it's yours
  let pre = "";
  function paintPre() {
    const M = vis.M, H = M && M.hand, me = M ? mineI(M) : -1, show = mode === "table" && !!H && H.street < 4 && me >= 0 && !H.p[me].folded && !H.p[me].allin && !myTurn(M) && ui.bar.hidden;
    ui.preact.hidden = !show; if (!show) return;
    const L = legal(H), owe = Math.max(0, H.curBet - (H.p[me].bet || 0)); if (pre === "ck" && owe > 0) pre = "";
    ui.preact.querySelectorAll("[data-pa]").forEach((b) => { b.classList.toggle("on", pre === b.dataset.pa); if (b.dataset.pa === "ck") b.hidden = owe > 0; if (b.dataset.pa === "ca") b.innerHTML = owe > 0 ? `${esc(T("Call"))} <small>${fmt(owe)}</small>` : esc(T("Call any")); }); void L;
  }
  function preGo() {
    const M = vis.M; if (!pre || !myTurn(M) || actBusy) return; const H = M.hand, L = legal(H), k = pre; pre = "";
    if (k === "cf") move(L.check ? { t: "check" } : { t: "fold" }); else if (k === "ca") move(L.check ? { t: "check" } : { t: "call" }); else if (k === "ck" && L.check) move({ t: "check" });
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
    ui.title.textContent = M.kind === "mp" ? (M.crew ? T("Crew table") + " [" + M.crew + "]" : M.priv ? T("Private table") : T("Table")) + " · " + fmt(M.stake.sb) + "/" + fmt(M.stake.bb) : T("Solo · {lvl}", { lvl: T(LEVELS[G ? G.lvl : 0]) });
    if (G && (G.rule || G.tut) && M.kind !== "mp") ui.title.textContent = G.tut ? T("Tutorial · 3 hands") : T("Today's rule · {r}", { r: T((ruleOf(seoulDay()) || {}).name || "") });
    ui.sub.textContent = M.kind === "mp" ? (M.tour ? T("Sit & Go · Level {l} · Blinds {b} · {n} left", { l: M.tour.lv, b: fmt(M.tour.sb) + "/" + fmt(M.tour.bb), n: M.tour.left }) : M.priv && M.code ? T("Code {c}", { c: M.code }) : T("Hand #{n}", { n: H ? H.handNo : "–" })) + (M.watch ? " · 👁 " + M.watch : "") : T("Hand {n} / {m} · Blinds {b}", { n: G ? G.hands : 0, m: G ? G.len : lenOf(prog), b: H ? fmt(H.sb) + "/" + fmt(H.bb) : "" });
  }
  // the seat labels, the pot, the bets and ARCIA's words follow the table on screen; the clock of whoever's turn it is
  function place() {
    if (!ui || !S || !vis.M) return; const M = vis.M, H = M.hand, W = innerWidth / scaleK();
    for (let d = 0; d < 6; d++) {
      const el = ui.seats[d]; if (el.hidden) continue;
      if (d === 0) { el.style.transform = ""; continue; } // (yours sits with your cards; the far ones come in onto the felt, below the heroes' faces)
      const p = slotPos(d, d === 3 ? 0.9 : d === 2 || d === 4 ? 0.98 : 1.1), s = toScreen(p.x, 0.1, p.z), x = Math.max(58, Math.min(W - 58, s.x));
      el.style.transform = `translate(${x}px, ${s.y}px) translate(-50%, -50%)`;
    }
    const pt = H ? (vis.win ? vis.potLeft || 0 : vis.tot.reduce((a, b) => a + b, 0)) : 0; ui.pot.hidden = !pt; if (pt) { const s = toScreen(0, 0.2, -1.3); ui.pot.style.transform = `translate(${s.x}px, ${s.y}px) translate(-118%, -50%)`; /* (beside the pot's chips: above them is the far seat's bet) */ ui.potV.textContent = fmt(pt); }
    for (let d = 0; d < 6; d++) { const el = ui.betL[d], seatI = H ? H.seatOf.indexOf((d + (M.me >= 0 ? M.me : 0)) % 6) : -1, b = seatI >= 0 ? vis.bet[seatI] : 0; el.hidden = !(b > 0); if (b > 0) { const p = slotPos(d, 0.6), s = toScreen(p.x, 0.1, p.z); el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, 40%)`; el.textContent = fmt(b); } }
    if (!ui.arcia.hidden) { const s = toScreen(1.1, 3.55 + DY, DZ), bw = ui.arcia.offsetWidth || 200; ui.arcia.style.transform = `translate(${Math.max(8, Math.min(W - bw - 8, s.x))}px, ${Math.max(70, s.y)}px)`; } // (b-pky: the whole bubble on the screen)
    // the clock
    const ti = H && H.street < 4 && !Q.length ? H.toAct : -1;
    for (let d = 0; d < 6; d++) { ui.seats[d].classList.remove("turn", "hurry"); const ts = ui.seats[d].querySelector(".pk-tsec"); if (ts) ts.hidden = true; }
    if (ti >= 0) {
      const d = dOfI(M, ti), el = ui.seats[d]; el.classList.add("turn");
      let f = 1; if (M.kind === "mp" && M.deadline) f = Math.max(0, Math.min(1, (M.deadline - Date.now()) / (POKER.TURN_S * 1000))); else if (G && G.botAt && ti !== H.mine) f = Math.max(0, (G.botAt - performance.now()) / 1400);
      el.style.setProperty("--t", f.toFixed(3));
      if (M.kind === "mp" && ti === H.mine && f < 0.3 && !vis.warned) { vis.warned = true; snd("tap"); }
      // b-pky: your last 10 seconds counted on your seat, the last 5 in red with a tick and a buzz
      const left = M.kind === "mp" && M.deadline ? Math.ceil((M.deadline - Date.now()) / 1000) : 99, tsec = el.querySelector(".pk-tsec");
      if (tsec) { const showS = left <= 10 && left >= 0; tsec.hidden = !showS; if (showS) tsec.textContent = left; el.classList.toggle("hurry", left <= 5 && left >= 0);
        if (ti === H.mine && left <= 5 && left >= 1 && vis.tickAt !== left) { vis.tickAt = left; snd("tap"); buzz([18]); } }
    }
  }
  function say(t, ms = 2800) { if (!ui) return; ui.arcia.textContent = t; ui.arcia.hidden = false; ui.arcia.classList.remove("go"); void ui.arcia.offsetWidth; ui.arcia.classList.add("go"); clearTimeout(sayT); sayT = setTimeout(() => { if (ui) ui.arcia.hidden = true; }, ms * Math.max(0.3, fast)); }
  function flash(t, c = "") { const el = document.createElement("div"); el.className = "pk-flash " + c; el.textContent = t; ui.root.appendChild(el); setTimeout(() => el.remove(), 1700); }
  function banner(html, c) { ui.banner.innerHTML = html; ui.banner.className = "pk-banner " + c; ui.banner.hidden = false; void ui.banner.offsetWidth; ui.banner.classList.add("go"); clearTimeout(ui.bannerT); ui.bannerT = setTimeout(() => { if (ui) ui.banner.hidden = true; }, 2900 * Math.max(0.3, fast)); }
  function buzz(p) { if (!prog.buzz || !ctx.coarse) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* no vibration here */ } }
  /// b-fx2: a royal flush — gold sparks burst out from the middle of the table, twice
  function goldBurst() {
    if (ctx.reduce || !ui) return;
    for (let w = 0; w < 2; w++) setTimeout(() => { for (let k = 0; k < 36; k++) { const el = document.createElement("i"); el.className = "pk-gold"; ui.root.appendChild(el);
      const a = Math.random() * Math.PI * 2, r = 160 + Math.random() * 320, sz = 0.6 + Math.random() * 0.9;
      el.animate([{ transform: `translate(-50%,-50%) scale(${sz}) rotate(0deg)`, opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r * 0.7 + 60}px)) scale(${sz * 0.3}) rotate(${(Math.random() - 0.5) * 720}deg)`, opacity: 0 }],
        { duration: 1100 + Math.random() * 700, easing: "cubic-bezier(.15,.7,.3,1)", fill: "forwards" }).onfinish = () => el.remove(); } }, w * 520);
  }
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
  /// a solo game: your settings; o.rule: today's rule (engine RULES: blinds ×, stacks, how fast the blinds rise, who
  /// sits down); o.tut: the tutorial (3 hands against a Beginner, ARCIA coaching)
  function soloStart(o = {}) {
    lastSolo = o; const rule = o.rule ? ruleOf(seoulDay()) : null, tut = !!o.tut, start = (rule && rule.start) || POKER.START;
    const n = tut ? 1 : rule && rule.ais ? rule.ais : Math.max(1, Math.min(5, prog.ais | 0)), lvl = tut ? 0 : rule && rule.lvl != null ? rule.lvl : Math.max(0, Math.min(3, prog.lvl | 0)), slots = LAYOUT[n + 1], seats = Array(6).fill(null);
    const names = rule && rule.foe ? [rule.foe, ...BOTS.filter((x) => x !== rule.foe)] : tut ? ["AI LUMI", ...BOTS.filter((x) => x !== "AI LUMI")] : BOTS;
    slots.forEach((s, k) => { seats[s] = k === 0 ? { name: meName(), stack: start, bot: false, ...myLook() } : { name: names[k - 1], stack: start, bot: true, lvl, ...botLook(names[k - 1]) }; });
    G = { n, lvl, slots, seats, hands: 0, len: tut ? 3 : rule ? POKER.RULE_HANDS : lenOf(prog), button: slots[Math.floor(Math.random() * slots.length)], best: -1, botAt: 0, nextAt: 0, runP: null, at: Date.now(), over: false,
      rule: rule ? rule.id : "", tut, start, mul: (rule && rule.blinds) || 1, rise: (rule && rule.rise) || 0, st: {}, big: null, bestFive: null, coach: "" };
    const ss = ctx.sess && ctx.sess();
    G.runP = ss && ctx.post ? ctx.post({ action: "world-poker-solo-start", ...ss, lvl, ...(rule ? { rule: rule.id } : {}), ...(tut ? { tut: true } : {}) }).then((r) => (r && r.ok && r.j && r.j.runId ? r.j.runId : null)).catch(() => null) : Promise.resolve(null);
    R = null; toTable(); vis = blank(); soloDeal();
  }
  function soloModel() { return { kind: "solo", seats: G.seats, me: 0, hand: G.hand, deadline: 0, stake: { sb: G.hand ? G.hand.sb : 10, bb: G.hand ? G.hand.bb : 20 } }; }
  function soloDeal() {
    const ready = G.slots.filter((s) => G.seats[s].stack > 0);
    // out of chips with hands still to play: one rebuy a game, if you like
    if (G.seats[0].stack <= 0 && !G.rebuy && G.hands < G.len && ready.length >= 1) { G.asking = true; modal(`<p class="pk-say">${esc(T("Out of chips~ ♡ One more go?"))}</p><p>${esc(T("Rebuy {n} chips (once a game)", { n: fmt(G.start) }))}</p><div class="pk-row"><button type="button" class="pk-btn" data-a="endGame">${esc(T("End the game"))}</button><button type="button" class="pk-btn go" data-a="rebuy">${esc(T("Rebuy"))}</button></div>`, true); return; }
    if (G.seats[0].stack <= 0 || ready.length < 2 || G.hands >= G.len) return soloOver();
    let b = G.button; for (let k = 1; k <= 6; k++) { const j = (G.button + k) % 6; if (ready.includes(j)) { b = j; break; } } G.button = b;
    const every = G.rise || riseOf(G.len), lv = Math.floor(G.hands / every), sb = 10 * G.mul * 2 ** lv, bb = sb * 2; // (b-pky: a short game's blinds rise sooner; b-pky3: the daily rule's)
    const H = newHand({ players: ready.map((s) => ({ id: "s" + s, name: G.seats[s].name, stack: G.seats[s].stack, bot: G.seats[s].bot, lvl: G.seats[s].lvl })), button: ready.indexOf(b), sb, bb, seed: (Math.random() * 2 ** 31) | 0, handNo: ++G.hands });
    H.seatOf = ready; H.mine = ready.indexOf(0); G.hand = H; G.botAt = 0; G.nextAt = 0;
    if (G.hands > 1 && G.hands % every === (every === 1 ? 0 : 1)) flash(T("Blinds up: {b}", { b: fmt(sb) + "/" + fmt(bb) }), "big");
    if (G.tut) G.coach = "";
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
    const order = G.slots.map((s) => ({ s, ...G.seats[s] })).sort((a, b) => b.stack - a.stack), place = order.findIndex((x) => x.s === 0) + 1, mine = G.seats[0].stack, won = place === 1 && mine > 0, spent = G.start * (1 + (G.rebuy || 0));
    if (G.tut && !prog.tut) { prog.tut = true; if (!signed()) { const had = badgesOf(prog.st); prog.st = { ...(prog.st || {}), tut: 1 }; newBadges(had, badgesOf(prog.st)); } save(); setTimeout(() => ctx.toast(`🎓 <b>${esc(T("Tutorial complete! ♡"))}</b>`), 600); }
    const lv0 = levelOf(prog.xp).lv, day = seoulDay();
    if (prog.day !== day) { prog.day = day; prog.xpToday = 0; }
    const xpG = Math.max(0, Math.min(POKER.XP_GAME, POKER.XP_DAY - prog.xpToday)); prog.xp += xpG; prog.xpToday += xpG; prog.games++; if (won) prog.wins++; if (G.best > prog.best) prog.best = G.best; save();
    if (ctx.gain) try { ctx.gain(25, "poker"); } catch { /* the game still counts */ }
    // b-pky3: the game in three cards (the best hand, the biggest pot, where you finished), to share
    const rc = `<div class="pk-rcards"><div class="pk-rc"><small>${esc(T("Best hand"))}</small><span>${G.bestFive ? G.bestFive.map((c) => cardHtml(c, "sm")).join("") : "🂠"}</span><b>${G.best >= 0 ? esc(T(HANDS[G.best])) : "–"}</b></div>
      <div class="pk-rc"><small>${esc(T("Biggest pot"))}</small><span class="big">${G.big ? fmt(G.big.got) : "–"}</span><b>${G.big ? esc(T("{n} big blinds", { n: fmt(G.big.bb) })) : esc(T("No pot won"))}</b></div>
      <div class="pk-rc"><small>${esc(T("Finish"))}</small><span class="big">#${place}<em>/${order.length}</em></span><b class="${mine >= spent ? "up" : "down"}">${mine >= spent ? "+" : ""}${fmt(mine - spent)}</b></div></div>`;
    sheet(`<div class="pk-res"><h2>${esc(G.tut ? T("TUTORIAL DONE!") : won ? T("YOU WIN THE GAME!") : T("GAME OVER"))}</h2><p class="pk-say">${esc(G.tut ? T("You know the game now~ Try a real one! ♡") : won ? T("What a game~ You're a natural! ♡") : T("Good game~ ♡ One more?"))}</p>${G.rule ? `<p class="pk-rulechip">📜 ${esc(T("Today's rule · {r}", { r: T(ruleOf(seoulDay()).name) }))}</p>` : ""}${rc}
      <ol class="pk-places">${order.map((x, k) => `<li class="${x.s === 0 ? "me" : ""}"><i>${k + 1}</i><b>${esc(x.name)}</b><span>${fmt(x.stack)}</span></li>`).join("")}</ol>
      <div class="pk-stats"><span>${esc(T("Hands"))} <b>${G.hands}</b></span><span>${esc(T("Chips"))} <b class="${mine >= spent ? "up" : "down"}">${mine >= spent ? "+" : ""}${fmt(mine - spent)}</b></span>${G.rebuy ? `<span>${esc(T("Rebuy used"))}</span>` : ""}<span>${esc(T("Best hand"))} <b>${G.best >= 0 ? esc(T(HANDS[G.best])) : "–"}</b></span></div>
      <div class="pk-pay" data-pay>${signed() ? esc(T("Sending your game…")) : esc(T("Guest play: sign in to count missions and earn ARCL"))}</div>
      <div class="pk-row"><button type="button" class="pk-btn" data-a="lobby">${esc(T("Lounge"))}</button>${ctx.share ? `<button type="button" class="pk-btn" data-a="shareGame">📸 ${esc(T("Share"))}</button>` : ""}<button type="button" class="pk-btn go" data-a="again">${esc(G.tut ? T("PLAY SOLO") : T("Play again"))}</button></div></div>`);
    lastGame = { won, place, n: order.length, net: mine - spent, best: G.best, five: G.bestFive, big: G.big, rule: G.rule, hands: G.hands };
    snd(won ? "level" : "close");
    const box = ui.sheet.querySelector("[data-pay]"), runId = await G.runP;
    if (!signed() || !runId) { if (signed() && box) box.textContent = T("This game couldn't be counted — try again later"); levelUp(lv0); return; }
    let r = null; try { r = await ctx.post({ action: "world-poker-solo-end", ...ctx.sess(), runId, hands: G.hands, won, best: G.best, st: G.st, chips: mine }); } catch { r = null; }
    if (!box || !box.isConnected) return;
    if (!r || !r.ok) { box.textContent = r && r.j && /faster/.test(r.j.error || "") ? T("Too quick to count — a game needs at least 20 seconds") : T("This game couldn't be counted — try again later"); return; }
    const j = r.j, before = status ? status.lv : lv0; status = j.prog || status; if (status) news(status.news);
    const m = status && status.mis ? status.mis : { solo: 0 };
    box.classList.toggle("paid", j.credited > 0);
    box.innerHTML = `${j.xp ? `<span>+${j.xp} ${esc(T("poker XP"))}</span>` : `<span>${esc(T("Today's poker XP is full"))}</span>`}<span>${esc(T("Solo games today: {n}/{m}", { n: Math.min(m.solo, 3), m: 3 }))}</span>${j.credited > 0 ? `<b>+${fmt(j.credited)} ARCL · ${esc(T("Mission complete!"))}</b>` : ""}`;
    if (j.credited > 0) { snd("coin"); if (ctx.refresh) ctx.refresh(); confetti(30); }
    if (m.solo === 2) say(T("Two down, one to go~ Today's mission is almost yours! 💙💚"), 4000);
    levelUp(before);
  }
  let lastGame = null;
  /// b-pky3: the last solo game as a share card
  function shareGame() {
    const g = lastGame; if (!g || !ctx.share) return; const cards = g.five ? g.five.map((c) => rankTxt(c) + SUITS[suitOf(c)]) : [];
    ctx.share({ kind: "poker", tag: "ARCIA POKER LOUNGE", title: g.won ? T("I WON THE GAME!") : T("#{p} of {n}", { p: g.place, n: g.n }), sub: g.best >= 0 ? T(HANDS[g.best]) : T("{n} hands", { n: g.hands }), accent: "#b48cff", emoji: "🃏", cards,
      rows: [[T("Best hand"), g.best >= 0 ? T(HANDS[g.best]) : "–", "🃏"], [T("Biggest pot"), g.big ? fmt(g.big.got) : "–", "💰"], [T("Finish"), `#${g.place}/${g.n}`, "🏆"], [T("Chips"), (g.net >= 0 ? "+" : "") + fmt(g.net), "🪙"]],
      text: T("I just played ARCIA POKER LOUNGE: #{p} of {n}, best hand {h}! 🃏", { p: g.place, n: g.n, h: g.best >= 0 ? T(HANDS[g.best]) : "–" }) });
  }
  function levelUp(before) { const now = lvInfo().lv; if (now > before) { banner(`<b>${esc(T("LEVEL UP!"))} Lv ${now}</b><small>${esc(T(titleOf(now)))}</small>`, "jackpot"); const u = [...BACKS, ...FELTS].filter((x) => x.lv > before && x.lv <= now); if (u.length) setTimeout(() => ctx.toast(esc(T("Unlocked: {x}", { x: u.map((x) => T(x.name)).join(", ") }))), 1200); } }

  // ---------------- the tables (a wallet): the server deals; this page asks for the table about once a second ----------------
  const errText = (e) => { const m = String((e && e.message) || e || ""); const known = { "not enough chips for the entry": "Not enough chips for the entry", "this Sit & Go is full": "This Sit & Go is full", "this Sit & Go has started": "This Sit & Go has started", "sign-up isn't open yet": "Sign-up isn't open yet", "not enough chips for this table": "Not enough chips for this table", "the table is full": "That table is full", "no table with that code": "No table with that code", "not your turn": "Not your turn", "no such table": "That table has closed", network: "Network trouble — try again", "not enough ARCL": "Not enough ARCL", "today's chip limit is reached": "Today's chip limit is reached", "one moment": "One moment…" }; return T(known[m] || m).slice(0, 80); };
  async function api(body) {
    const ss = ctx.sess && ctx.sess(); if (!ss) throw new Error(T("Sign in with a wallet to play at the tables"));
    const look = /^world-poker-(create|join)$/.test(body.action) ? myLook() : {}; // (the hero you're drawn as at the table)
    let r; try { r = await ctx.post({ ...body, ...look, ...ss }); } catch { throw new Error("network"); }
    if (!r || !r.ok) throw Object.assign(new Error((r && r.j && r.j.error) || "network"), { status: r && r.status });
    return r.j;
  }
  const stakeOf = (id) => POKER.STAKES.find((x) => x.id === id) || POKER.STAKES[0];
  function modelOf(room) { return { kind: "mp", id: room.id, seats: room.seats, me: room.me, hand: room.hand, deadline: room.deadline ? room.deadline - (R ? R.off : 0) : 0, stake: stakeOf(room.stake), code: room.code, priv: room.priv, crew: room.crew || "", tour: room.tour || null, watch: room.watch || 0 }; }
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
    paintChat(room.chat || []); news(room.news);
    sync(modelOf(room)); sngOver(room);
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
      try { const j = await api({ action: "world-poker-view", room: R.id, ...(R.watch || !R.seated ? { vt: VT } : {}) }); if (!R || R.tok !== tok) break; R.fails = 0; ui.root.classList.remove("lost"); syncRoom(j.room); }
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
      const M = vis.M; if (M) { const si = M.seats.findIndex((s) => s && s.name === m.n); if (si >= 0) { const d = dispOf(M, si), el2 = ui.seats[d], bb = document.createElement("i"); bb.className = "pk-bubble" + (m.e ? " emo" : ""); bb.textContent = txt; el2.appendChild(bb); setTimeout(() => bb.remove(), 3200);
        if (m.e && S && S.lounge) S.lounge.react(d, m.t === ":gg:" || m.t === ":nice:" || m.t === ":heart:" ? "win" : m.t === ":wow:" ? "fold" : "hi"); } } // (b-pky2: the hero in that chair answers the emote)
    }
  }

  // ---------------- b-pky2: the scheduled Sit & Go (api/_world-poker.mjs SNG) ----------------
  const EMO_N = { wave: "Wave", cheer: "Cheer", lol: "Laugh", heart: "Love", gg: "Good game", dance: "Dance" };
  const VT = Math.random().toString(36).slice(2, 12).padEnd(8, "0"); // (a watcher's token: the table counts who's watching)
  async function sngRead() {
    try { const r = await ctx.post({ action: "world-poker-sng", ...(signed() ? ctx.sess() : {}) }); if (!r || !r.ok || !r.j) return; const old = sngL; sngL = { ...r.j, off: r.j.now - Date.now() }; sngT = Date.now();
      // yours has just started: to your seat
      const mine = sngL.list.find((g) => g.mine && g.state === "play" && g.room), was = old && old.list.find((g) => mine && g.id === mine.id);
      if (mine && was && was.state === "reg" && mode === "lobby") { ctx.toast(`🏆 <b>${esc(T("Your Sit & Go is starting — to your seat!"))}</b>`); snd("enter"); join(mine.room, false); }
    } catch { /* the card waits for the next look */ }
  }
  const clock = (at) => { try { return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
  const inT = (ms) => { const m = Math.max(0, Math.ceil(ms / 60e3)); return m >= 60 ? T("{h}h {m}m", { h: Math.floor(m / 60), m: m % 60 }) : T("{m} min", { m }); };
  function sngHtml() {
    const L = sngL; if (!L || !L.list) return `<section class="pk-box sng"><header><b>🏆 ${esc(T("SIT & GO"))}</b><small>${esc(T("Every 2 hours · 6 seats"))}</small></header><p class="pk-note">…</p></section>`;
    const sg = signed(), t = Date.now() + (L.off || 0), ru = L.rules || {};
    const rows = L.list.map((g) => {
      const st = g.state === "reg" ? T("Starts in {t}", { t: inT(g.at - t) }) : g.state === "play" ? T("Playing now") : g.places && g.places[0] ? T("Won by {name}", { name: g.places[0].name }) : T("Finished");
      const btn = !sg ? "" : g.state === "reg" ? (g.mine ? `<button type="button" class="pk-mini" data-sng-un="${esc(g.id)}">✓ ${esc(T("Signed up"))} · ${esc(T("Cancel"))}</button>` : `<button type="button" class="pk-mini go" data-sng-reg="${esc(g.id)}" ${g.n >= g.max || (L.chips != null && L.chips < g.entry) ? "disabled" : ""}>${esc(T("Sign up"))} · ${fmt(g.entry)}</button>`)
        : g.state === "play" ? (g.mine ? `<button type="button" class="pk-mini go" data-room="${esc(g.room)}">${esc(T("To your seat"))}</button>` : `<button type="button" class="pk-mini" data-watch="${esc(g.room)}">${esc(T("Watch"))}</button>`) : "";
      return `<li class="${g.state}${g.mine ? " mine" : ""}"><div><b>${esc(clock(g.at))}</b><small>${esc(st)}</small></div><span class="pk-sngp" title="${esc(g.pay.map((x) => fmt(x)).join(" · "))}">🏆 ${fmt(g.pay[0])}</span><span class="pk-sngn">${g.n}/${g.max}</span>${btn}</li>`;
    }).join("");
    return `<section class="pk-box sng"><header><b>🏆 ${esc(T("SIT & GO"))}</b><small>${esc(T("Every 2 hours · 6 seats · {c} tournament chips · blinds up every {k} hands", { c: fmt(ru.start || 1500), k: ru.lvHands || 5 }))}</small></header>
      <ul class="pk-sngl">${rows}</ul><p class="pk-note">${esc(sg ? T("Entry in chips (back if you cancel before it starts) · computers fill the empty seats · prizes for the top 3 in chips + poker XP · the winner's title") : T("Sign in with a wallet to sign up"))}</p></section>`;
  }
  const sngReg = (id, on) => guard(async () => { const j = await api({ action: on ? "world-poker-sng-reg" : "world-poker-sng-unreg", id }); if (status && j.chips != null) status.chips = j.chips; snd(on ? "coin" : "tap"); if (on) ctx.toast(esc(T("Signed up — it starts at {t}", { t: clock(j.sng.at) }))); await sngRead(); if (mode === "lobby") paintLobby(); });
  /// a Sit & Go ends at your table: the places, your prize
  function sngOver(room) {
    const tr = room.tour; if (!tr || !tr.done || !R || R.sngShown === tr.id) return; R.sngShown = tr.id;
    const P = tr.places || [], mine = tr.mine, prize = mine >= 0 && mine < 3 ? tr.pay[mine] : 0;
    setTimeout(() => { if (!R || mode !== "table") return;
      if (mine === 0) { banner(`<b>🏆 ${esc(T("SIT & GO CHAMPION!"))}</b><small>+${fmt(prize)} ${esc(T("Chips"))}</small>`, "jackpot"); confetti(60); goldBurst(); snd("win"); } else if (prize) { snd("coin"); confetti(24); }
      modal(`<h3>${esc(T("Sit & Go · the places"))}</h3><ol class="pk-places">${P.map((y, k) => `<li class="${k === mine ? "me" : ""}"><i>${k + 1}</i><b>${esc(y.name)}</b><span>${k < 3 ? "+" + fmt(tr.pay[k]) : ""}</span></li>`).join("")}</ol>
        <p class="pk-note">${esc(mine >= 0 ? (prize ? T("Your place: {n} · +{c} chips and poker XP", { n: mine + 1, c: fmt(prize) }) : T("Your place: {n}", { n: mine + 1 })) : T("Watching"))}</p>
        <div class="pk-row"><button type="button" class="pk-btn go" data-a="lobby">${esc(T("Lounge"))}</button></div>`, true);
    }, 1800);
  }

  // ---------------- the lounge (lobby) ----------------
  let festG = null;
  const fest = () => (status && status.fest) || festG;
  /// what the server said happened (a stamp, a jackpot, a champion's prize): each line once, as a toast
  function news(list) {
    if (!list || !list.length) return; let seen = 0; try { seen = Number(localStorage.getItem(SAVE + ".news")) || Date.now() - 864e5; } catch { seen = Date.now() - 864e5; }
    const fresh = list.filter((x) => x.at > seen).sort((a, b) => a.at - b.at); if (!fresh.length) return;
    fresh.slice(-3).forEach((x, k) => setTimeout(() => { const m = x.t === "first" ? T("First purchase bonus: +{c} chips", { c: fmt(x.c) }) : x.t === "stamp" ? T("Festival stamp {n}/7!", { n: x.n }) : x.t === "stampPay" ? T("{n} stamps: +{a} ARCL", { n: x.n, a: fmt(x.a) }) : x.t === "night" ? T("Unlocked: the Opening Night card back") : x.t === "royal" ? T("ROYAL FLUSH JACKPOT: +{c} chips · the title ARCIA's Chosen", { c: fmt(x.c) }) : x.t === "bj3" ? T("Three blackjacks in a row: +{c} chips", { c: fmt(x.c) }) : x.t === "champ" ? T("Table Champion #{r}: +{c} chips · the Champion Gold felt", { r: x.r, c: fmt(x.c) }) : x.t === "badge" ? T("New badge: {b}", { b: T((BADGES.find((b) => b.id === x.id) || { name: x.id }).name) }) : "";
      if (m) { ctx.toast(`🎉 <b>${esc(m)}</b>`); snd(x.t === "stampPay" || x.t === "champ" || x.t === "royal" ? "coin" : "pick"); if (x.t === "stampPay" && ctx.refresh) ctx.refresh(); } }, 600 + k * 1800));
    try { localStorage.setItem(SAVE + ".news", String(fresh[fresh.length - 1].at)); } catch { /* shown again next visit */ }
  }
  async function readStatus() {
    const jobs = [fetch("/api/social?world=poker-fest").then((r) => (r.ok ? r.json() : null)).then((j) => { festG = j && j.fest; }).catch(() => {})];
    if (signed()) jobs.push(ctx.post({ action: "world-poker-me", ...ctx.sess() }).then((r) => { if (r && r.ok && r.j) { status = r.j.prog; news(status.news); } }).catch(() => {}));
    if (signed() && tab === "play") jobs.push(fetch("/api/social?world=poker-rooms", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { roomsL = j && j.rooms; }).catch(() => {}));
    if (tab === "play") jobs.push(sngRead());
    if (tab === "play") jobs.push(fetch("/api/social?world=poker-rule").then((r) => (r.ok ? r.json() : null)).then((j) => { ruleB = j; }).catch(() => {})); // b-pky3
    if (signed() && (tab === "play" || tab === "rank")) jobs.push(ctx.post({ action: "world-poker-crew", ...ctx.sess() }).then((r) => { if (r && r.ok && r.j) crewL = r.j; }).catch(() => {}));
    if (tab === "rank") jobs.push(fetch("/api/social?world=poker-top").then((r) => (r.ok ? r.json() : null)).then((j) => { topB = j; }).catch(() => {}));
    await Promise.race([Promise.all(jobs), sleep(4000)]);
  }
  function toTable() { walkEnd(); if (BJK.active()) BJK.stop(); setFelt("poker"); ui.replayB.hidden = false; mode = "table"; closeModal(); ui.sheet.hidden = true; ui.root.classList.remove("menu"); ui.top.hidden = false; ui.hand.hidden = false; ui.replayB.disabled = true; if (S && S.ace) S.ace.visible = false; clearTable(); frame(); }
  function sheet(html) { ui.sheet.innerHTML = html; ui.sheet.hidden = false; ui.sheet.scrollTop = 0; }
  function hideTable() { ui.root.classList.add("menu"); ui.top.hidden = true; ui.hand.hidden = true; ui.bar.hidden = true; ui.raise.hidden = true; ui.wait.hidden = true; ui.tools.hidden = true; ui.chat.hidden = true; ui.pot.hidden = true; ui.betL.forEach((e) => { e.hidden = true; }); ui.seats.forEach((e) => { e.hidden = true; }); }
  function toBJ() { walkEnd(); mode = "bj"; G = null; closeModal(); hideTable(); ui.root.classList.remove("menu"); ui.sheet.hidden = true; ui.top.hidden = false; ui.replayB.hidden = true; if (S && S.ace) S.ace.visible = false; clearTable(); setFelt("bj"); frame(); }
  function lobby() {
    if (BJK.active()) BJK.stop(); setFelt("poker");
    mode = "lobby"; G = null; if (R) { leaveTable(); } Q.length = 0; latest = null; vis = blank(); clearTable(); closeModal();
    hideTable();
    if (S && S.ace) S.ace.visible = true;
    if (S && S.lounge) { for (let d = 0; d < 6; d++) S.lounge.seat(d, d >= 2 && d <= 4 ? botLook(BOTS[d - 2]) : null); walkBegin(lobby.at || [0, 9.6]); lobby.at = null; } // (three AI players wait at the table)
    frame(); paintLobby();
    if (!lobby.said) { lobby.said = true; say(T("Let's play together~ ♡"), 3200); }
    readStatus().then(() => { if (mode === "lobby") paintLobby(); });
  }
  /// b-pky3: your crew's tables (a crew of your own: Menu → Crew)
  function crewHtml() {
    if (!crewL) return ""; const c = crewL.crew;
    if (!c) return `<p class="pk-lbl">${esc(T("Crew tables"))}</p><p class="pk-note">${esc(T("Join or start a crew (Menu → Crew) to open tables just for your crew"))}</p>`;
    return `<p class="pk-lbl">${esc(T("Crew tables"))} · [${esc(c.tag)}]</p><ul class="pk-rooms">${crewL.rooms.length ? crewL.rooms.map((r) => { const s2 = stakeOf(r.stake); return `<li><b>${fmt(s2.sb)}/${fmt(s2.bb)}</b><span>${esc(r.names.join(", "))}</span><button type="button" class="pk-mini go" data-room="${esc(r.id)}" ${r.n >= 6 ? "disabled" : ""}>${esc(T("Join"))}</button></li>`; }).join("") : `<li class="none">${esc(T("No crew table open — start one"))}</li>`}</ul>
      <div class="pk-priv"><select data-cstake>${POKER.STAKES.map((s2) => `<option value="${s2.id}">${fmt(s2.sb)}/${fmt(s2.bb)}</option>`).join("")}</select><button type="button" class="pk-mini go" data-a="crewNew">${esc(T("Start a crew table"))}</button></div>`;
  }
  const createCrew = (stake) => guard(async () => { const j = await api({ action: "world-poker-create", stake, crew: true }); snd("enter"); sitAt(j.room); });
  function festHtml(full) {
    const f = fest(); if (!f) return ""; const F = POKER.FEST, me = status && status.fest, left = Math.max(0, f.end - Date.now()), dd = Math.floor(left / 864e5), hh = Math.floor((left % 864e5) / 36e5);
    const stamps = me ? me.stamps.length : 0, dots = Array.from({ length: F.DAYS }, (_, k) => { const n = k + 1, prize = F.STAMPS[n]; return `<i class="${n <= stamps ? "on" : ""}${prize ? " prize" : ""}">${n <= stamps ? "★" : n}${prize ? `<em>${n === 7 ? "+" + fmt(prize) + " · 🂠" : "+" + fmt(prize)}</em>` : ""}</i>`; }).join("");
    return `<section class="pk-fest"><header><b>🎉 ${esc(T("OPENING FESTIVAL"))}</b><small>${esc(T("Day {d}/{n} · {t} left", { d: f.day, n: f.days, t: dd ? T("{d}d {h}h", { d: dd, h: hh }) : T("{h}h", { h: hh }) }))}</small></header>
      ${f.happy ? `<p class="pk-happy">⏰ ${esc(T("HAPPY HOUR NOW: mission progress ×2"))}</p>` : ""}
      <div class="pk-stamps">${dots}</div>
      <p class="pk-note">${me ? esc(T("10 table or blackjack hands a day = 1 stamp · today {n}/10", { n: Math.min(10, me.played || 0) })) : esc(T("Sign in with a wallet to collect stamps"))} · ${esc(T("ARCL at 3, 5 and 7 stamps"))}</p>
      ${full ? `<ul class="pk-festl"><li>🎁 ${esc(T("Free chips doubled: {n} a day", { n: fmt(F.CHIPS) }))}</li>${!me || me.first ? `<li>🪙 ${esc(T("First chip purchase: +50% chips"))}</li>` : ""}<li>⏰ ${esc(T("Happy hour 20:00–22:00 (KST): mission progress ×2"))}</li>
        <li>🃏 ${esc(T("Royal flush at a table: +{a} chips · 3 blackjacks in a row: +{b}", { a: fmt(F.ROYAL), b: fmt(F.BJ3) }))}</li><li>🏆 ${esc(T("This week's top 3 at the tables: {a} / {b} / {c} chips + the Champion Gold felt", { a: fmt(F.CHAMP[0]), b: fmt(F.CHAMP[1]), c: fmt(F.CHAMP[2]) }))}</li></ul>` : ""}</section>`;
  }
  // ---------------- b-pk3d: walking the lounge ----------------
  // the lobby is the room: your hero walks it (the stick, WASD / arrows, or a tap on a place's name walks you there),
  // and the place you stand at offers what it does; "Lounge menu" (or a place's button) brings up the old sheet
  const PLACES = { table: { n: "ARCIA's table", y: 2.4, go: [["holdem", "Play Hold'em"], ["bj", "Blackjack"]] }, cashier: { n: "Chips & missions", go: [["shop", "Chip shop"], ["missions", "Missions"]] },
    board: { n: "This week's board", go: [["rank", "Ranking"]] }, style: { n: "Card backs & felts", go: [["profile", "Profile & style"]] }, exit: { n: "Back to town", go: [["leave", "Back to town"]] } };
  function walkBegin(at) {
    walkUp = true; if (ui.sheet) ui.sheet.hidden = true; ui.walk.hidden = false; joy.x = joy.y = 0; wKeys.clear(); walkPaint();
    S.lounge.walkStart(myLook(), at); frame();
    if (!topB && !walkBegin.asked) { walkBegin.asked = true; fetch("/api/social?world=poker-top").then((r) => (r.ok ? r.json() : null)).then((j) => { if (j) { topB = j; walkPaint(); } }).catch(() => {}); } // (the week's board on the wall)
  }
  function walkEnd() { if (!walkUp && !(S && S.lounge && S.lounge.walking())) { if (ui && ui.walk) ui.walk.hidden = true; return; } walkUp = false; if (ui && ui.walk) ui.walk.hidden = true; joy.x = joy.y = 0; wKeys.clear(); if (S && S.lounge) { S.lounge.walkStop(); S.lounge.others([]); } }
  /// the old sheet over the room (a place's button, or the menu): walking pauses until it closes
  function sheetUp(t) { if (t) tab = t; walkUp = false; ui.walk.hidden = true; joy.x = joy.y = 0; wKeys.clear(); frame(); paintLobby(); if (t === "rank" || t === "play" || t === "missions") readStatus().then(() => { if (mode === "lobby" && !walkUp) paintLobby(); }); }
  function sheetDown() { if (mode !== "lobby" || !S || !S.lounge) return; ui.sheet.hidden = true; walkUp = true; ui.walk.hidden = false; frame(); walkPaint(); }
  function walkPaint() {
    if (!ui || !ui.walk) return; ui.walkChips.textContent = status ? fmt(status.chips || 0) : signed() ? "…" : T("practice");
    if (S && S.lounge && topB && topB.top) S.lounge.setBoard(topB.top);
  }
  const wv = new THREE.Vector3();
  function walkTick(dt) {
    const L = S.lounge, busyUi = !ui.modal.hidden; let x = joy.x, y = joy.y;
    if (!busyUi) { if (wKeys.has("ArrowLeft") || wKeys.has("KeyA")) x -= 1; if (wKeys.has("ArrowRight") || wKeys.has("KeyD")) x += 1; if (wKeys.has("ArrowUp") || wKeys.has("KeyW")) y += 1; if (wKeys.has("ArrowDown") || wKeys.has("KeyS")) y -= 1; }
    const n = Math.hypot(x, y); if (n > 1) { x /= n; y /= n; }
    L.step(dt, busyUi ? null : { x, y, fast: wKeys.has("ShiftLeft") || wKeys.has("ShiftRight") }); L.camFollow(S.cam, dt);
    S.dlr.parent.lookAt(S.cam.position.x, S.dlr.parent.position.y + (S.cam.position.y - S.dlr.parent.position.y) * 0.35, S.cam.position.z);
    // the places' names over them, and what the one you're at offers
    const W = innerWidth / scaleK(), H = innerHeight / scaleK(), me = L.me();
    for (const el of ui.walkTags) {
      const id = el.dataset.go, st = id === "table" ? { x: 0, z: 0, h: 2.4 } : L.stations.find((q) => q.id === id); if (!st) continue;
      wv.set(st.x, (st.h || 2.4) - 1.25, st.z).project(S.cam); const on = wv.z < 1 && Math.abs(wv.x) < 1.1 && Math.abs(wv.y) < 1.1;
      el.hidden = !on; if (!on) continue; const V = view(), k = scaleK(), sx = (V.x + ((wv.x + 1) / 2) * V.w) / k, sy = (V.y + ((1 - wv.y) / 2) * V.h) / k;
      el.style.transform = `translate(${Math.max(60, Math.min(W - 60, sx))}px, ${Math.max(70, Math.min(H - 150, sy))}px) translate(-50%, -100%)`;
      el.classList.toggle("far", Math.hypot(me.x - st.x, me.z - st.z) > 16);
    }
    const nr = L.near(), key = nr ? nr.id : "";
    if (ui.walkGo.dataset.k !== key) {
      ui.walkGo.dataset.k = key; const P = nr && PLACES[nr.id];
      ui.walkGo.hidden = !P; if (P) ui.walkGo.innerHTML = `<small>${esc(T(P.n))}</small><div>${P.go.map(([a, t], i) => `<button type="button" data-w="${a}" class="${i ? "" : "go"}">${esc(T(t))}</button>`).join("")}</div>`;
      if (P) snd("tap");
    }
  }
  function walkAct(a) {
    if (a === "holdem") sheetUp("play");
    else if (a === "bj") { snd("enter"); BJK.start(); }
    else if (a === "shop") { snd("open"); openShop(); }
    else if (a === "leave") leave();
    else sheetUp(a);
  }
  function joyDown(e) { if (!walkUp) return; e.preventDefault(); joy.id = e.pointerId; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ } joyMove(e); }
  function joyMove(e) {
    if (e.pointerId !== joy.id) return; const r = ui.joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, R0 = r.width / 2;
    let dx = (e.clientX - cx) / R0, dy = (e.clientY - cy) / R0; const n = Math.hypot(dx, dy); if (n > 1) { dx /= n; dy /= n; }
    joy.x = dx; joy.y = -dy; ui.joyK.style.transform = `translate(${dx * 36}px, ${dy * 36}px)`;
  }
  function joyUp(e) { if (e.pointerId !== joy.id) return; joy.id = -1; joy.x = joy.y = 0; ui.joyK.style.transform = ""; }
  const wkd = (e) => { if (!on || !walkUp || e.target.matches("input,select,textarea")) return; if (/^(Arrow|Key[WASD]$|Shift)/.test(e.code)) { wKeys.add(e.code); if (e.code.startsWith("Arrow")) e.preventDefault(); } else if (e.code === "KeyE" || e.code === "Enter") { const b = ui.walkGo.querySelector("button.go"); if (b && !ui.walkGo.hidden) { e.preventDefault(); b.click(); } } };
  const wku = (e) => { wKeys.delete(e.code); };
  function paintLobby() {
    if (walkUp) { walkPaint(); return; } // (walking the room: the sheet stays away until it's asked for)
    const sg = signed(), li = lvInfo(), chips = status ? status.chips : 0, saved = (() => { try { return localStorage.getItem(ROOMK) || ""; } catch { return ""; } })();
    const tabs = [["play", T("Play")], ["missions", T("Missions")], ["rank", T("Ranking")], ["profile", T("Profile")], ["rules", T("How to play")]];
    let pane = "";
    if (tab === "play") {
      const rl = ruleOf(seoulDay()), rtop = (ruleB && ruleB.top) || [];
      pane = festHtml(true) + (prog.tut ? "" : `<section class="pk-box tut"><header><b>🎓 ${esc(T("NEW TO POKER?"))}</b><small>${esc(T("3 hands with ARCIA by your side"))}</small></header><button type="button" class="pk-btn go wide" data-a="tut">${esc(T("LEARN IN 3 HANDS"))}</button></section>`) + sngHtml()
        + `<section class="pk-box rule"><header><b>📜 ${esc(T("TODAY'S RULE"))} · ${esc(T(rl.name))}</b><small>${esc(T(RULE_TXT[rl.id] || ""))} · ${esc(T("{n} hands", { n: POKER.RULE_HANDS }))}</small></header>
        ${rtop.length ? `<ol class="pk-rank mini">${rtop.slice(0, 3).map((x, k) => `<li><i>${k + 1}</i><b>${esc(x.name || x.w)}</b><span>${fmt(x.n)}${x.won ? " 🏆" : ""}</span></li>`).join("")}</ol>` : `<p class="pk-note">${esc(T("No one on today's board yet — be the first!"))}</p>`}
        <button type="button" class="pk-btn go wide" data-a="rule">${esc(T("PLAY TODAY'S RULE"))}</button></section>` + `<section class="pk-box solo"><header><b>${esc(T("SOLO · PRACTICE"))}</b><small>${esc(T("{n} hands · {c} chips each · blinds rise every {k} hands", { n: lenOf(prog), c: fmt(POKER.START), k: riseOf(lenOf(prog)) }))}</small></header>
        <div class="pk-opt"><span>${esc(T("Game length"))}</span><div class="pk-seg">${LENS.map((n) => `<button type="button" data-len="${n}" class="${lenOf(prog) === n ? "on" : ""}">${esc(n === 6 ? T("Quick {n}", { n }) : n === 24 ? T("Long {n}", { n }) : String(n))}</button>`).join("")}</div></div>
        <div class="pk-opt"><span>${esc(T("AI players"))}</span><div class="pk-seg">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-ais="${n}" class="${prog.ais === n ? "on" : ""}">${n}</button>`).join("")}</div></div>
        <div class="pk-opt"><span>${esc(T("Level"))}</span><div class="pk-seg">${LEVELS.map((l, k) => `<button type="button" data-lvl="${k}" class="${prog.lvl === k ? "on" : ""}">${esc(T(l))}</button>`).join("")}</div></div>
        <p class="pk-note sty">${esc(T("NEX pushes · LUMI is careful · ARON bluffs · ARC plays it straight · MINT calls a lot"))}</p>
        <button type="button" class="pk-btn go wide" data-a="solo">${esc(T("PLAY SOLO"))}</button></section>
        <section class="pk-box bjbox"><header><b>${esc(T("BLACKJACK"))}</b><small>${esc(sg ? T("vs ARCIA · your chips · blackjack pays 3 to 2") : T("vs ARCIA · practice chips · blackjack pays 3 to 2"))}</small></header><button type="button" class="pk-btn go wide" data-a="bj">${esc(T("PLAY BLACKJACK"))}</button></section>`;
      if (!sg) pane += `<section class="pk-box mp"><header><b>${esc(T("MULTIPLAYER"))}</b><small>${esc(T("2–6 players at a real table"))}</small></header><p class="pk-note">${esc(T("Sign in with a wallet to play at the tables"))}</p></section>`;
      else pane += `<section class="pk-box mp"><header><b>${esc(T("MULTIPLAYER"))}</b><small>${esc(T("Your chips: {n}", { n: fmt(chips) }))} · ${esc(T("free {n} a day", { n: fmt(POKER.DAY_CHIPS) }))}</small></header>
        <button type="button" class="pk-btn wide shopb" data-a="shop">🪙 ${esc(T("Chip shop"))} · ${esc(T("buy chips with ARCL"))}</button>
        ${saved ? `<button type="button" class="pk-btn hot wide" data-room="${esc(saved)}">${esc(T("Back to your table"))}</button>` : ""}
        <p class="pk-lbl">${esc(T("Quick match"))}</p><div class="pk-stakes">${POKER.STAKES.map((s) => `<button type="button" data-quick="${s.id}" ${status && chips < s.buy ? "disabled" : ""}><b>${fmt(s.sb)}/${fmt(s.bb)}</b><small>${esc(T("buy-in {n}", { n: fmt(s.buy) }))}</small></button>`).join("")}</div>
        <p class="pk-lbl">${esc(T("Open tables"))} <button type="button" class="pk-mini" data-a="rooms">↻</button></p>
        <ul class="pk-rooms">${roomsL && roomsL.length ? roomsL.map((r) => { const s = stakeOf(r.stake); return `<li><b>${fmt(s.sb)}/${fmt(s.bb)}</b><span>${r.n}/6 · ${esc(T("{n} people", { n: r.h }))}${r.playing ? " · " + esc(T("playing")) : ""}</span><button type="button" class="pk-mini" data-watch="${esc(r.id)}">${esc(T("Watch"))}</button><button type="button" class="pk-mini go" data-room="${esc(r.id)}" ${r.n >= 6 ? "disabled" : ""}>${esc(T("Join"))}</button></li>`; }).join("") : `<li class="none">${esc(T("No open tables right now — start one with Quick match"))}</li>`}</ul>
        ${crewHtml()}
        <p class="pk-lbl">${esc(T("Private table"))}</p><div class="pk-priv"><select data-pstake>${POKER.STAKES.map((s) => `<option value="${s.id}">${fmt(s.sb)}/${fmt(s.bb)}</option>`).join("")}</select><button type="button" class="pk-mini go" data-a="priv">${esc(T("Create"))}</button><input inputmode="numeric" maxlength="6" placeholder="${esc(T("6-digit code"))}" data-code><button type="button" class="pk-mini go" data-a="code">${esc(T("Join"))}</button></div></section>`;
    } else if (tab === "missions") {
      pane = festHtml(false);
      const m = status && status.mis ? status.mis : { solo: 0, hands: 0 }, row = (k, have, need, t) => `<li class="${have >= need ? "done" : ""}"><b>${esc(t)}</b><div class="pk-bar2"><i style="width:${Math.min(100, (have / need) * 100)}%"></i></div><span>${Math.min(have, need)}/${need}</span><em>+${fmt(POKER.MISSIONS[k].arcl)} ARCL</em></li>`;
      pane += sg ? `<ul class="pk-mis">${row("solo3", m.solo || 0, 3, T("Finish 3 solo games"))}${row("hands20", m.hands || 0, 20, T("Play 20 table hands"))}${row("bj30", m.bj || 0, 30, T("Play 30 blackjack hands"))}</ul><p class="pk-note">${esc(T("Once a day each · paid for playing, never for winning"))}</p>` : `<p class="pk-note">${esc(T("Sign in with a wallet to earn ARCL from the daily missions"))}</p><ul class="pk-mis dim">${row("solo3", 0, 3, T("Finish 3 solo games"))}${row("hands20", 0, 20, T("Play 20 table hands"))}${row("bj30", 0, 30, T("Play 30 blackjack hands"))}</ul>`;
      pane += `<p class="pk-note">${esc(T("Free chips every day, or buy chips with ARCL in the chip shop — chips never turn back into ARCL."))}</p>`;
    } else if (tab === "rank") {
      const rows = (topB && topB.top) || [];
      pane = `<p class="pk-lbl">${esc(T("This week's most chips won at the tables"))}</p><ol class="pk-rank">${rows.length ? rows.map((x, k) => `<li><i>${k + 1}</i><b>${esc(x.name || x.w)}</b><span class="${x.n >= 0 ? "up" : "down"}">${x.n >= 0 ? "+" : ""}${fmt(x.n)}</span></li>`).join("") : `<li class="none">${esc(T("No one on the board yet this week — be the first!"))}</li>`}</ol>`;
      const cb = (crewL && crewL.board) || []; // b-pky3: the crews' week
      pane += `<p class="pk-lbl">${esc(T("Crews this week"))}</p><ol class="pk-rank">${cb.length ? cb.map((x, k) => `<li class="${x.mine ? "me" : ""}"><i>${k + 1}</i><b>[${esc(x.tag)}] ${esc(x.name)}</b><span class="${x.n >= 0 ? "up" : "down"}">${x.n >= 0 ? "+" : ""}${fmt(x.n)}</span></li>`).join("") : `<li class="none">${esc(T("No crew on the board yet — play a crew table!"))}</li>`}</ol>`;
    } else if (tab === "profile") {
      const games = status ? status.games : prog.games, wins = status ? status.wins : prog.wins, bst = status ? status.best : prog.best, ul = unlockLv();
      pane = `<div class="pk-prof"><b class="pk-lvn">Lv ${li.lv}</b><span>${esc(T(titleOf(li.lv)))}</span><div class="pk-bar2 xp"><i style="width:${li.lv >= POKER.LEVELS ? 100 : (li.into / li.need) * 100}%"></i></div><small>${li.lv >= POKER.LEVELS ? "MAX" : `${fmt(li.into)} / ${fmt(li.need)} XP`}</small></div>
        <div class="pk-stats"><span>${esc(T("Games"))} <b>${fmt(games)}</b></span><span>${esc(T("Win rate"))} <b>${games ? Math.round((wins / games) * 100) : 0}%</b></span><span>${esc(T("Best hand"))} <b>${bst >= 0 ? esc(T(HANDS[bst])) : "–"}</b></span>${status ? `<span>${esc(T("Table hands"))} <b>${fmt(status.hands)}</b></span>` : ""}<span>${esc(T("Blackjack hands"))} <b>${fmt(status ? status.bjHands : prog.bjHands || 0)}</b></span><span>${esc(T("Blackjacks"))} <b>${fmt(status ? status.bjBJ : prog.bjBJ || 0)}</b></span></div>
        ${statsHtml()}
        <p class="pk-lbl">${esc(T("Card backs"))}</p><div class="pk-skins">${BACKS.map((b) => skinBtn(b, "back", ul)).join("")}</div>
        <p class="pk-lbl">${esc(T("Table felt"))}</p><div class="pk-skins">${FELTS.map((b) => skinBtn(b, "felt", ul)).join("")}</div>
        ${histHtml()}
        ${status && status.titles && status.titles.length ? `<p class="pk-lbl">${esc(T("Titles"))}</p><div class="pk-titles">${status.titles.map((t) => `<span>👑 ${esc(T(t))}</span>`).join("")}</div>` : ""}
        <p class="pk-lbl">${esc(T("Settings"))}</p><div class="pk-tog"><button type="button" data-tog="hint" class="${prog.hint ? "on" : ""}">${esc(T("Hand strength hint"))}<b>${esc(prog.hint ? T("On") : T("Off"))}</b></button>${ctx.coarse ? `<button type="button" data-tog="buzz" class="${prog.buzz ? "on" : ""}">${esc(T("Vibration"))}<b>${esc(prog.buzz ? T("On") : T("Off"))}</b></button>` : ""}</div>
        <p class="pk-note">${esc(T("Poker XP: +{a} a finished game (a table game is 10 hands), up to {b} a day", { a: POKER.XP_GAME, b: POKER.XP_DAY }))}</p>`;
    } else {
      pane = `<ol class="pk-rules"><li>${esc(T("Everyone gets two cards; five shared cards come in the middle (3, then 1, then 1)."))}</li><li>${esc(T("Make the best five-card hand from your two and the five shared."))}</li><li>${esc(T("Each round: check, bet, call, raise or fold. The best hand at the end — or the last one left — wins the pot."))}</li></ol>
        <ul class="pk-ranks">${HANDS.slice().reverse().map((h, k) => `<li><b>${k + 1}. ${esc(T(h))}</b><span>${EXAMPLES[k].map((s) => cardHtml(cc(s), "sm")).join("")}</span></li>`).join("")}</ul>`;
    }
    sheet(`<div class="pk-lobby">${S && S.lounge ? `<button type="button" class="pk-shx" data-a="shx" aria-label="${esc(T("Close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` : ""}<div class="pk-head"><i class="pk-face"></i><div><h2>${esc(T("ARCIA POKER LOUNGE"))}</h2><p>${esc(T("Texas Hold'em & Blackjack with ARCIA"))}</p></div><span class="pk-lvchip">Lv ${li.lv}</span></div>
      <div class="pk-tabs">${tabs.map(([k, t]) => `<button type="button" data-tab="${k}" class="${k === tab ? "on" : ""}">${esc(t)}</button>`).join("")}</div>
      <div class="pk-pane">${pane}</div>
      <button type="button" class="pk-btn" data-a="leave">${esc(T("Leave the lounge"))}</button></div>`);
  }
  /// b-pky3: a look's button: yours, for chips (🪙), for a level, or an event's prize
  function skinBtn(b, k, ul) {
    const lk = locked(b, ul), price = priceOf(b), on = prog[k] === b.id;
    if (lk && price) return `<button type="button" data-buylook="${esc(b.need)}" class="shop" style="--a:${b.a};--b:${b.b}"><i class="sw ${k}"></i><small>${esc(T(b.name))}</small><em>🪙 ${fmt(price)}</em></button>`;
    return `<button type="button" data-${k}="${b.id}" class="${on ? "on" : ""}" ${lk ? "disabled" : ""} style="--a:${b.a};--b:${b.b}"><i class="sw ${k}"></i><small>${lk ? (b.need ? "🔒 " + esc(T("Event")) : "🔒 Lv " + b.lv) : esc(T(b.name))}</small></button>`;
  }
  /// b-pky3: your counts and badges (the server's for a wallet: table and solo hands; this device's for a guest)
  function statsHtml() {
    const st = myStats(), got = myBadges(), h = st.h || 0, pc = (n) => (h ? Math.round(((n || 0) / h) * 100) + "%" : "–");
    return `<p class="pk-lbl">${esc(T("Your play"))}</p><div class="pk-stats"><span>${esc(T("Hands played"))} <b>${fmt(h)}</b></span><span>${esc(T("Money in by choice"))} <b>${pc(st.vpip)}</b></span><span>${esc(T("Pots won"))} <b>${fmt(st.win || 0)}</b></span><span>${esc(T("Showdowns won"))} <b>${fmt(st.sd || 0)}</b></span><span>${esc(T("All-ins won"))} <b>${fmt(st.allin || 0)}</b></span><span>${esc(T("Biggest pot"))} <b>${st.big ? esc(T("{n} big blinds", { n: fmt(st.big) })) : "–"}</b></span></div>
      <p class="pk-lbl">${esc(T("Badges"))} <small>${got.length}/${BADGES.length}</small></p><div class="pk-badges">${BADGES.map((b) => { const have = got.includes(b.id), v = Math.min(b.need, st[b.k] || 0); return `<div class="${have ? "on" : ""}" title="${esc(T(b.name))}"><i>${have ? "🏅" : "🔒"}</i><b>${esc(T(b.name))}</b><small>${have ? esc(T("Earned")) : `${fmt(v)}/${fmt(b.need)}`}</small></div>`; }).join("")}</div>`;
  }
  /// b-pky3: the last 20 hands on this device: tap one to replay it (and share it)
  function histHtml() {
    const a = histLoad(); if (!a.length) return `<p class="pk-lbl">${esc(T("Recent hands"))}</p><p class="pk-note">${esc(T("Your last 20 hands show here — replay and share them"))}</p>`;
    return `<p class="pk-lbl">${esc(T("Recent hands"))}</p><ul class="pk-hist">${a.map((r, k) => `<li><button type="button" data-hist="${k}"><span>${(r.mine || []).map((c) => cardHtml(c, "sm")).join("")}</span><b>${esc(r.top && r.top.i === r.me ? T(r.top.name) : r.kind === "mp" ? T("Table") : T("Solo"))}</b><em class="${r.net > 0 ? "up" : r.net < 0 ? "down" : ""}">${r.net > 0 ? "+" : ""}${fmt(r.net)}</em></button></li>`).join("")}</ul>`;
  }
  // ---------------- the chip shop: ARCL → chips, one way ----------------
  let arclBal = null;
  async function openShop() {
    if (!signed()) { ctx.toast(esc(T("Sign in with a wallet to buy chips"))); return; }
    modal(`<h3>${esc(T("Chip shop"))}</h3><div class="pk-spin"></div>`);
    const w = String(ctx.sess().wallet || "").toLowerCase();
    await Promise.all([fetch("/api/social?world=arcl&wallet=" + encodeURIComponent(w), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { arclBal = j ? j.bal || 0 : null; }).catch(() => {}), readStatus()]);
    if (ui.modal.hidden) return; paintShop();
  }
  function paintShop() {
    const chips = status ? status.chips || 0 : 0;
    modal(`<h3>${esc(T("Chip shop"))}</h3><p class="pk-shopbal"><span>${esc(T("Your chips"))} <b>${fmt(chips)}</b></span><span>${esc(T("Your ARCL"))} <b>${arclBal == null ? "–" : fmt(arclBal)}</b></span></p>
      <div class="pk-packs">${POKER.PACKS.map((pk, k) => `<button type="button" data-pack="${pk.id}" ${arclBal != null && arclBal < pk.arcl ? "disabled" : ""}><b>${fmt(pk.chips)}</b><small>${esc(T("chips"))}${k ? ` · +${Math.round((pk.chips / (pk.arcl * 10) - 1) * 100)}%` : ""}</small><em>${fmt(pk.arcl)} ARCL</em></button>`).join("")}</div>
      ${fest() && status && status.fest && status.fest.first ? `<p class="pk-note gold">🎉 ${esc(T("Opening Festival: +50% chips on your first purchase"))}</p>` : ""}
      <p class="pk-note warn">${esc(T("Chips can't be turned back into ARCL. Buy only what you want to play with."))}</p>
      <p class="pk-note">${esc(T("Up to {n} ARCL of chips a day · free chips every day too", { n: fmt(POKER.BUY_DAY) }))}</p>
      <div class="pk-row"><button type="button" class="pk-btn" data-a="close">${esc(T("Close"))}</button></div>`);
  }
  function askBuy(id) {
    const pk = POKER.PACKS.find((x) => x.id === id); if (!pk) return;
    modal(`<p class="pk-say">${esc(T("Buy {c} chips for {a} ARCL?", { c: fmt(pk.chips), a: fmt(pk.arcl) }))}</p><p class="pk-note warn">${esc(T("Chips can't be turned back into ARCL."))}</p><div class="pk-row"><button type="button" class="pk-btn" data-a="shopBack">${esc(T("Cancel"))}</button><button type="button" class="pk-btn go" data-a="buyGo" data-id="${pk.id}">${esc(T("Buy"))}</button></div>`, true);
  }
  /// b-pky3: a card back or a felt for chips
  function askLook(id) {
    const it = POKER.SHOP.find((x) => x.id === id), b = [...BACKS, ...FELTS].find((x) => x.need === id); if (!it || !b) return;
    if (!signed()) { ctx.toast(esc(T("Sign in with a wallet to buy looks with chips"))); return; }
    modal(`<p class="pk-say">${esc(T("Get {x} for {c} chips?", { x: T(b.name), c: fmt(it.chips) }))}</p><div class="pk-lookp" style="--a:${b.a};--b:${b.b}"><i class="sw ${id.startsWith("back") ? "back" : "felt"}"></i></div><p class="pk-note">${esc(T("Yours to keep · chips don't come back"))}</p><div class="pk-row"><button type="button" class="pk-btn" data-a="close">${esc(T("Cancel"))}</button><button type="button" class="pk-btn go" data-a="lookGo" data-id="${esc(id)}" ${status && (status.chips || 0) < it.chips ? "disabled" : ""}>🪙 ${fmt(it.chips)}</button></div>`, true);
  }
  const lookGo = (id) => guard(async () => {
    const j = await api({ action: "world-poker-look-buy", id }); status = j.prog || status; closeModal(); snd("buy"); confetti(20);
    const b = [...BACKS, ...FELTS].find((x) => x.need === id); ctx.toast(`✨ <b>${esc(T("Unlocked: {x}", { x: T(b ? b.name : id) }))}</b>`); if (mode === "lobby") paintLobby();
  });
  const buyGo = (id) => guard(async () => {
    const j = await api({ action: "world-poker-buy", pack: id }); status = j.prog || status; arclBal = j.bal; news(status.news);
    snd("buy"); ctx.toast(`<b>+${fmt(j.chips)}</b> ${esc(T("chips"))} · −${fmt(POKER.PACKS.find((x) => x.id === id).arcl)} ARCL`); if (ctx.refresh) ctx.refresh();
    paintShop(); BJK.repaint(); if (mode === "lobby") paintLobby();
  });
  function replay(r = vis.replay) {
    if (!r) return; repR = r;
    const nm = (i) => esc(r.names[i] || "?"), streets = [T("Pre-flop"), T("Flop"), T("Turn"), T("River")], lines = [[], [], [], []];
    for (const e of r.log) { if (e.t === "street") continue; const s = Math.min(3, e.st), a = fmt(e.a); lines[s].push(e.t === "sb" || e.t === "bb" ? T("{name} posts {n}", { name: nm(e.i), n: a }) : e.t === "fold" ? T("{name} folds", { name: nm(e.i) }) : e.t === "check" ? T("{name} checks", { name: nm(e.i) }) : e.t === "call" ? T("{name} calls {n}", { name: nm(e.i), n: a }) : e.t === "allin" ? T("{name} goes all in ({n})", { name: nm(e.i), n: a }) : T("{name} raises to {n}", { name: nm(e.i), n: a })); }
    const opp = (s) => { let n = 0; r.alive0.forEach((al, i) => { if (!al || i === r.me) return; const f = r.log.find((e) => e.i === i && e.t === "fold"); if (!f || f.st >= s) n++; }); return Math.max(1, n); };
    const shown = r.result.shown || [], potW = r.result.pots.map((p) => `${p.win.map(nm).join(" & ")} · ${fmt(p.amt)}`).join(" · ");
    modal(`<h3>${esc(T("Hand #{n}", { n: r.handNo }))} · ${fmt(r.sb)}/${fmt(r.bb)}</h3><div class="pk-rep">${streets.map((t, s) => { const bd = r.board.slice(0, s === 0 ? 0 : s + 2); if (s > 0 && !lines[s].length && !(r.log.some((e) => e.t === "street" && e.a === s))) return "";
      const eq = r.mine && r.mine[0] >= 0 ? Math.round(equity(r.mine, bd, opp(s), 240, Math.random) * 100) : null;
      return `<section><header><b>${esc(t)}</b>${bd.length ? `<span>${bd.map((c) => cardHtml(c, "sm")).join("")}</span>` : ""}${eq != null ? `<em>${esc(T("Your chance {n}%", { n: eq }))}</em>` : ""}</header>${lines[s].map((l) => `<p>${l}</p>`).join("")}</section>`; }).join("")}
      <section><header><b>${esc(T("Result"))}</b></header>${shown.map((x) => `<p>${nm(x.i)}: ${x.hole.map((c) => cardHtml(c, "sm")).join("")} ${esc(T(x.name))}</p>`).join("")}<p class="win">${esc(T("Pot"))}: ${potW}</p></section></div>
      <div class="pk-row"><button type="button" class="pk-btn" data-a="close">${esc(T("Close"))}</button>${ctx.share && r.mine ? `<button type="button" class="pk-btn go" data-a="shareHand">📸 ${esc(T("Share this hand"))}</button>` : ""}</div>`);
  }
  /// b-pky3: a hand as a share card (your cards, the board, what it made, the pot)
  function shareHand(r = repR) {
    if (!r || !r.mine || !ctx.share) return; const nm = (c) => rankTxt(c) + SUITS[suitOf(c)], mine = r.mine.map(nm), board = r.board.map(nm), potAll = r.result.pots.reduce((a, p) => a + p.amt, 0);
    const made = r.top && r.top.i === r.me ? T(r.top.name) : r.net > 0 ? T("Won the pot") : T("Hand #{n}", { n: r.handNo });
    ctx.share({ kind: "poker", tag: "ARCIA POKER LOUNGE", title: made, sub: mine.join(" ") + (board.length ? "  ·  " + board.join(" ") : ""), accent: r.net > 0 ? "#ffd23a" : "#62a8ff", emoji: "🃏", cards: [...mine, ...board],
      rows: [[T("My cards"), mine.join(" "), "🂠"], [T("Board"), board.join(" ") || "–", "🃏"], [T("Pot"), fmt(potAll), "💰"], [T("Result"), (r.net >= 0 ? "+" : "") + fmt(r.net), r.net > 0 ? "🏆" : "🙂"]],
      text: T("My hand at ARCIA POKER LOUNGE: {c} → {h} 🃏", { c: mine.join(" "), h: made }) });
  }

  // ---------------- the layer ----------------
  const scaleK = () => (document.documentElement.classList.contains("wp-pcphone") ? innerWidth / 400 : Math.max(1, Math.min(1.25, innerHeight / 860)));
  function fit() { if (!ui) return; const k = scaleK(); ui.root.classList.toggle("wide", wide()); Object.assign(ui.root.style, { width: innerWidth / k + "px", height: innerHeight / k + "px", transform: `scale(${k})` }); if (S) frame(); }
  function buildUi() {
    const root = document.createElement("div"); root.className = "pk"; root.hidden = true;
    const seat = (d) => `<div class="pk-seat" data-d="${d}" hidden><div class="pk-av"><i class="pk-ring"></i><span></span></div><div class="pk-info"><b class="nm"></b><span class="sk"></span><small class="lv"></small></div><em class="pk-act" hidden></em><strong class="pk-shown" hidden></strong><b class="pk-tsec" hidden></b><i class="pk-say2" hidden></i></div>`;
    root.innerHTML = `<div class="pk-top" data-game-hud hidden><button type="button" class="pk-back" data-a="menu" aria-label="${esc(T("Lounge"))}"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><div class="pk-title"><b></b><small></small></div><button type="button" class="pk-back" data-a="replay" aria-label="${esc(T("Replay"))}" disabled><svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5"/></svg></button></div>
      <div class="pk-tools" hidden><button type="button" data-a="bot">${esc(T("+ AI"))}</button><button type="button" data-a="sit">${esc(T("Sit down"))}</button><button type="button" data-a="chat">💬</button><button type="button" data-a="menu">${esc(T("Leave"))}</button></div>
      <div class="pk-chat" hidden>${Object.keys(EMO).map((k) => `<button type="button" data-say="${k}">${EMO[k]}</button>`).join("")}${PHRASES.map((p) => `<button type="button" data-say="${esc(p)}" class="ph">${esc(T(p))}</button>`).join("")}</div>
      <div class="pk-seats">${[1, 2, 3, 4, 5].map(seat).join("")}</div>
      <div class="pk-pot" hidden><small>${esc(T("POT"))}</small><b></b></div>${Array.from({ length: 6 }, () => '<i class="pk-betl" hidden></i>').join("")}
      <div class="pk-arcia" hidden></div><div class="pk-log"></div>
      <div class="pk-wait" hidden><span></span></div>
      <div class="pk-hand" hidden>${seat(0)}<div class="pk-mine"></div><div class="pk-hinfo"><b class="pk-hname"></b><small class="pk-hdesc"></small><em class="pk-eq"></em><div class="pk-str" hidden><span><i></i></span><b></b></div></div></div>
      <div class="pk-raise" hidden><div class="pk-pre"><button type="button" data-pre="min">${esc(T("Min"))}</button><button type="button" data-pre="0.5">½ ${esc(T("Pot"))}</button><button type="button" data-pre="1">${esc(T("Pot"))}</button><button type="button" data-pre="2">2× ${esc(T("Pot"))}</button></div><div class="pk-sl"><input type="range"><b class="amt"></b></div><div class="pk-row"><button type="button" class="pk-btn" data-a="raiseX">${esc(T("Cancel"))}</button><button type="button" class="pk-btn go" data-a="raiseGo"></button></div></div>
      <div class="pk-qb" hidden><button type="button" data-qb="0.5"><b>½ ${esc(T("Pot"))}</b><small></small></button><button type="button" data-qb="0.67"><b>⅔ ${esc(T("Pot"))}</b><small></small></button><button type="button" data-qb="1"><b>${esc(T("Pot"))}</b><small></small></button></div>
      <div class="pk-preact" hidden><small>${esc(T("Before your turn"))}</small><button type="button" data-pa="cf">${esc(T("Check / Fold"))}</button><button type="button" data-pa="ca">${esc(T("Call any"))}</button><button type="button" data-pa="ck">${esc(T("Check"))}</button></div>
      <div class="pk-bar" hidden><button type="button" class="f" data-a="fold"><b>${esc(T("FOLD"))}</b></button><button type="button" class="c" data-a="call"></button><button type="button" class="r" data-a="raise"></button><button type="button" class="a" data-a="allin"><b>${esc(T("ALL IN"))}</b></button></div>
      <div class="pk-banner" hidden></div><div class="pk-lost">${esc(T("Reconnecting…"))}</div>
      <div class="pk-walk" hidden><div class="pk-wtop" data-game-hud><button type="button" class="pk-back" data-a="leave" aria-label="${esc(T("Back to town"))}"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><div class="pk-wchip"><i>🪙</i><b></b></div><button type="button" class="pk-wmenu" data-a="sheet">☰ ${esc(T("Lounge menu"))}</button></div>
        ${Object.keys(PLACES).map((id) => `<button type="button" class="pk-wtag" data-go="${id}" hidden>${esc(T(PLACES[id].n))}</button>`).join("")}
        <div class="pk-wgo" hidden></div><div class="pk-emo">${Object.entries(EMOTE).map(([k, e]) => `<button type="button" data-emo="${k}" aria-label="${esc(T(EMO_N[k] || k))}">${e[1]}</button>`).join("")}</div><div class="pk-wseen" hidden></div><div class="pk-joy" aria-hidden="true"><i></i></div><p class="pk-whint">${esc(T(ctx.coarse ? "Walk with the stick, or tap a sign" : "Walk with WASD or the arrows, or click a sign · E to use"))}</p></div>
      <div class="pk-sheet" hidden></div><div class="pk-modal" hidden></div>`;
    document.body.appendChild(root);
    const q = (x) => root.querySelector(x);
    ui = { root, top: q(".pk-top"), title: q(".pk-title b"), sub: q(".pk-title small"), replayB: q('[data-a="replay"]'), tools: q(".pk-tools"), chat: q(".pk-chat"), pot: q(".pk-pot"), potV: q(".pk-pot b"), betL: [...root.querySelectorAll(".pk-betl")], arcia: q(".pk-arcia"), log: q(".pk-log"), wait: q(".pk-wait"), hand: q(".pk-hand"), mine: q(".pk-mine"), hname: q(".pk-hname"), hdesc: q(".pk-hdesc"), eq: q(".pk-eq"), str: q(".pk-str"), raise: q(".pk-raise"), bar: q(".pk-bar"), qb: q(".pk-qb"), preact: q(".pk-preact"), banner: q(".pk-banner"), sheet: q(".pk-sheet"), modal: q(".pk-modal"),
      b: { fold: q('[data-a="fold"]'), call: q('[data-a="call"]'), raise: q('[data-a="raise"]'), allin: q('[data-a="allin"]') } };
    ui.seats = [q('.pk-hand .pk-seat'), ...[1, 2, 3, 4, 5].map((d) => q(`.pk-seats [data-d="${d}"]`))];
    Object.assign(ui, { walk: q(".pk-walk"), walkChips: q(".pk-wchip b"), walkTags: [...root.querySelectorAll(".pk-wtag")], walkGo: q(".pk-wgo"), joy: q(".pk-joy"), joyK: q(".pk-joy i"), wseen: q(".pk-wseen") });
    ui.joy.addEventListener("pointerdown", joyDown); ui.joy.addEventListener("pointermove", joyMove); ui.joy.addEventListener("pointerup", joyUp); ui.joy.addEventListener("pointercancel", joyUp);
    ui.raise.querySelector("input").addEventListener("input", paintRaise);
    root.addEventListener("click", onClick);
    root.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("[data-code]")) joinCode(e.target.value.trim()); });
    addEventListener("resize", fit); fit();
  }
  function onClick(e) {
    const b = e.target.closest("button"); if (!b || !on || b.disabled) return; const a = b.dataset.a;
    if (b.dataset.go && S && S.lounge) { snd("tap"); S.lounge.goTo(b.dataset.go); return; } // (a place's name: walk there)
    if (b.dataset.w) { walkAct(b.dataset.w); return; }
    if (a === "sheet") { snd("open"); sheetUp(); return; }
    if (a === "shx") { snd("tap"); sheetDown(); return; }
    if (b.dataset.tab) { tab = b.dataset.tab; snd("tab"); paintLobby(); if (tab === "rank" || tab === "play" || tab === "missions") readStatus().then(() => { if (mode === "lobby") paintLobby(); }); return; }
    if (b.dataset.ais) { prog.ais = +b.dataset.ais; save(); snd("tap"); paintLobby(); return; }
    if (b.dataset.tog) { const k = b.dataset.tog; prog[k] = !prog[k]; save(); snd("tap"); paintLobby(); return; }
    if (b.dataset.lvl) { prog.lvl = +b.dataset.lvl; save(); snd("tap"); paintLobby(); return; }
    if (b.dataset.back) { prog.back = b.dataset.back; save(); for (const [k, t] of cardTex) if (String(k).startsWith("back:")) { t.dispose(); cardTex.delete(k); } if (S) for (const cd of S.cards) { cd.back.material.map = faceTex(-1); cd.back.material.needsUpdate = true; } snd("equip"); paintLobby(); return; }
    if (b.dataset.felt) { prog.felt = b.dataset.felt; save(); if (S) { const old = S.feltM.map; S.feltM.map = texOf(feltCanvas()); S.feltM.needsUpdate = true; if (old) old.dispose(); } snd("equip"); paintLobby(); return; }
    if (b.dataset.quick) { quick(b.dataset.quick); return; }
    if (b.dataset.pack) { snd("tap"); askBuy(b.dataset.pack); return; }
    if (b.dataset.buylook) { snd("tap"); askLook(b.dataset.buylook); return; }
    if (b.dataset.hist) { const r = histLoad()[+b.dataset.hist]; if (r) { snd("open"); replay(r); } return; }
    if (b.dataset.room) { join(b.dataset.room, false); return; }
    if (b.dataset.sngReg) { sngReg(b.dataset.sngReg, true); return; }
    if (b.dataset.emo) { if (S && S.lounge && S.lounge.emote(b.dataset.emo)) { snd("tap"); hereEm = b.dataset.emo; hereT = 0; } return; }
    if (b.dataset.sngUn) { sngReg(b.dataset.sngUn, false); return; }
    if (b.dataset.watch) { join(b.dataset.watch, true); return; }
    if (b.dataset.say) { chatSend(b.dataset.say); return; }
    if (b.dataset.qb) { const H = vis.M && vis.M.hand, L = H && legal(H); if (!L || !L.raise || !myTurn(vis.M)) return; const v = qbTo(H, L, +b.dataset.qb); snd("tap"); if (v >= L.raise.max) allinAsk(); else move({ t: "raise", to: v }); return; }
    if (b.dataset.pa) { pre = pre === b.dataset.pa ? "" : b.dataset.pa; snd("tap"); paintPre(); return; }
    if (b.dataset.len) { prog.len = +b.dataset.len; save(); snd("tap"); paintLobby(); return; }
    if (b.dataset.pre) { const H = vis.M && vis.M.hand, L = H && legal(H); if (!L || !L.raise) return; const P0 = pot(H) + L.toCall, k = b.dataset.pre, to = k === "min" ? L.raise.min : Math.round((H.curBet + P0 * +k) / H.bb) * H.bb; ui.raise.querySelector("input").value = Math.max(L.raise.min, Math.min(L.raise.max, to)); paintRaise(); snd("tap"); return; }
    if (a === "leave") leave();
    else if (a === "menu" && mode === "bj") lobby();
    else if (a === "menu") { if (mode === "table" && G && !G.over) modal(`<p>${esc(T("Leave this game? It won't count."))}</p><div class="pk-row"><button type="button" class="pk-btn" data-a="close">${esc(T("Stay"))}</button><button type="button" class="pk-btn hot" data-a="lobby">${esc(T("Leave"))}</button></div>`); else lobby(); }
    else if (a === "lobby") { closeModal(); lobby(); }
    else if (a === "close") closeModal();
    else if (a === "rebuy") { if (!G || G.over) return; closeModal(); G.asking = false; G.rebuy = 1; G.seats[0].stack = G.start; snd("coin"); flash(T("Rebuy: +{n}", { n: fmt(G.start) }), "big"); soloDeal(); }
    else if (a === "endGame") { closeModal(); if (G) { G.asking = false; soloOver(); } }
    else if (a === "solo") { snd("enter"); soloStart(); }
    else if (a === "rule") { snd("enter"); soloStart({ rule: true }); }
    else if (a === "tut") { snd("enter"); soloStart({ tut: true }); }
    else if (a === "lookGo") lookGo(b.dataset.id);
    else if (a === "shareHand") shareHand();
    else if (a === "shareGame") shareGame();
    else if (a === "crewNew") createCrew(ui.sheet.querySelector("[data-cstake]").value);
    else if (a === "bj") { snd("enter"); BJK.start(); }
    else if (a === "shop") { snd("open"); openShop(); }
    else if (a === "shopBack") paintShop();
    else if (a === "buyGo") buyGo(b.dataset.id);
    else if (a === "bjIns" || a === "bjNoIns") BJK.answer(a === "bjIns");
    else if (a === "again") { snd("enter"); soloStart(lastSolo.tut ? {} : lastSolo); }
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
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (G && G.asking) return; if (!ui.modal.hidden) closeModal(); else if (mode === "table" || mode === "result" || mode === "bj") onClick({ target: ui.root.querySelector('.pk-top [data-a="menu"]') }); else if (mode === "lobby" && !walkUp && S && S.lounge) sheetDown(); else leave(); return; }
    if (mode === "bj") { const k = e.key.toLowerCase(), m = { h: "hit", s: "stand", d: "double", p: "split", " ": "deal", enter: "deal" }[k]; if (m) { e.preventDefault(); BJK.press(m); } return; }
    if (mode !== "table" || !myTurn(vis.M)) return; const k = e.key.toLowerCase();
    if (k === "f" && !ui.b.fold.hidden) move({ t: "fold" }); else if (k === "c") ui.b.call.click(); else if (k === "r" && !ui.b.raise.hidden) ui.b.raise.click(); else if (k === "a" && !ui.b.allin.hidden) allinAsk();
  };

  // ---------------- b-pky2: who else is in the lounge (every 3 s while you walk it), the Sit & Go card's clock ----------------
  let hereT = 0, hereEm = "", hereBusy = false, fakePeers = []; // (fakePeers: the tests' made-up visitors)
  function lobbyTick() {
    const t = Date.now();
    if (walkUp && signed() && !hereBusy && !document.hidden && t - hereT > 3000) {
      hereT = t; hereBusy = true; const m = S.lounge.me(), em = hereEm; hereEm = "";
      ctx.post({ action: "world-poker-here", x: m.x, z: m.z, f: m.f, ...myLook(), ...(em ? { em } : {}), ...ctx.sess() }).then((r) => {
        if (!on || mode !== "lobby" || !walkUp || !r || !r.ok || !r.j) return; S.lounge.others([...(r.j.list || []), ...fakePeers]);
        const n = (r.j.list || []).length; ui.wseen.hidden = !n; ui.wseen.textContent = n ? T("{n} more in the lounge", { n }) : "";
      }).catch(() => {}).finally(() => { hereBusy = false; });
    }
    if (tab === "play" && t - sngT > 20000 && !document.hidden) { sngT = t; sngRead().then(() => { if (mode === "lobby" && !walkUp && !ui.sheet.hidden && !ui.sheet.contains(document.activeElement)) paintLobby(); }); }
  }

  // ---------------- each frame ----------------
  let lastNow = 0, frameMs = 16;
  function tick(dt0, t) {
    const now = performance.now(), dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : dt0; lastNow = now; frameMs += (dt * 1000 - frameMs) * 0.05;
    if (!S) return;
    if (S.cam.projectionMatrix.elements[9] !== S.p9 || S.key !== [view().w, view().h, mode, walkUp].join("x")) frame();
    for (let i = TWN.length - 1; i >= 0; i--) { const w = TWN[i]; w.t += dt; if (w.t < 0) continue; const k = Math.min(1, w.t / w.dur); try { w.f(k); } catch { /* a card gone */ } if (k >= 1) { TWN.splice(i, 1); if (w.done) try { w.done(); } catch { /* fine */ } } }
    runQ(now); soloTick(now); if (mode === "bj") BJK.tick();
    if (S.lounge) { S.lounge.show(mode === "lobby" || mode === "load" ? "lobby" : "table"); S.lounge.tick(dt, t); if (walkUp) walkTick(dt); }
    if (mode === "lobby") lobbyTick();
    if (mode === "table") { place(); if (!Q.length && !latest && ui.bar.hidden === myTurn(vis.M) && !actBusy) paintBar(); if (pre && myTurn(vis.M)) preGo(); }
    else if (!ui.arcia.hidden) { const s = toScreen(1.1, 3.9 + DY, DZ), W = innerWidth / scaleK(); ui.arcia.style.transform = `translate(${Math.min(W - 120, s.x)}px, ${Math.max(40, s.y)}px)`; }
    S.deal.position.y = DY + Math.sin(t * 1.3) * 0.03; S.halo.material.opacity = 0.45 + Math.sin(t * 0.9) * 0.1;
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
      addEventListener("keydown", kd, true); addEventListener("keydown", wkd); addEventListener("keyup", wku);
      return true;
    } catch (e) {
      console.warn("poker", e); ctx.toast(esc(T("The lounge couldn't open: {e}", { e: String((e && e.message) || e).slice(0, 70) }))); try { reset(); } catch { /* already reset */ } return false;
    } finally { busy = false; }
  }
  function reset() {
    on = false; mode = "off"; document.body.classList.remove("wp-poker"); if (ui) { ui.root.hidden = true; ui.sheet.hidden = true; ui.modal.hidden = true; }
    if (BJK.active()) BJK.stop(); if (R) leaveTable(); G = null; Q.length = 0; latest = null; TWN.length = 0; actBusy = false; busy = false;
    removeEventListener("keydown", kd, true); removeEventListener("keydown", wkd); removeEventListener("keyup", wku); walkEnd();
    try { if (prOrig && st.renderer.getPixelRatio() !== prOrig) st.renderer.setPixelRatio(prOrig); } catch { /* the town sets its own */ }
    try { st.solo(null); st.view(null); } catch { /* the world draws again */ }
  }
  function leave() { if (!on) return; reset(); if (ctx.onLeave) ctx.onLeave(); }
  const BJK = makeBlackjack({ THREE, T, esc, snd, say, banner, flash, confetti, buzz, tween, ease, moveCard, cardFrom, faceTex, toScreen, stackChips, flyChips, S: () => S, cardAt, ui: () => ui, prog: () => prog, save, ctx, signed, fast: () => fast, scaleK, phone, modal, closeModal, enterTable: toBJ, onProg: (p) => { if (p) { status = p; news(p.news); } }, chips: () => (status ? status.chips || 0 : 0), shop: () => openShop() });
  return {
    enter, leave, active: () => on,
    /// tests: the table's numbers, and a few levers
    debug: () => { const M = vis.M, H = M && M.hand; return { mode, kind: M ? M.kind : "", hand: H ? H.handNo : 0, street: H ? H.street : -1, board: vis.board, turn: myTurn(M), legal: H && myTurn(M) ? legal(H) : null, q: Q.length, me: M ? M.me : -1, seats: M ? M.seats.filter(Boolean).length : 0, stack: H && H.mine >= 0 ? vis.stack[H.mine] : null, hands: G ? G.hands : 0, over: G ? G.over : false, room: R ? R.id : "", fms: Math.round(frameMs), result: !!(H && H.result), shown: Object.keys(vis.shown).length, cards: S ? S.cards.filter((c) => c.o.visible).length : 0 }; },
    solo: (n, lvl) => { if (n) prog.ais = n; if (lvl != null) prog.lvl = lvl; soloStart(); },
    /// tests (b-pky3): today's rule, the tutorial, the hands kept, your counts, a look's purchase, share a hand
    rule: () => soloStart({ rule: true }), tut: () => soloStart({ tut: true }), hist: () => histLoad(), stats: () => ({ st: myStats(), badges: myBadges(), G: G ? { rule: G.rule, tut: G.tut, len: G.len, start: G.start, mul: G.mul, rise: G.rise, n: G.n, lvl: G.lvl, st: G.st, coach: G.coach } : null }),
    coachOn: () => [...ui.bar.querySelectorAll("button.coach")].map((b) => b.dataset.a), lookBuy: (id) => lookGo(id), status: () => status, crew: () => crewL, move: (t, to) => move({ t, to }), tab: (k) => { tab = k; paintLobby(); }, menu: () => lobby(), fast: (k) => { fast = k; },
    quick: (s) => quick(s), code: (c) => joinCode(c), priv: (s) => createPriv(s), replay: () => replay(),
    /// tests: the room's heroes (who sits where, their clips, which way they face; you walking)
    room: () => (S && S.lounge ? S.lounge.debug() : null), roomBones: (d) => (S && S.lounge ? S.lounge.bones(d) : null),
    /// tests (b-pky2): others in the lounge, an emote, the Sit & Go card's data and the end card
    peers: (list) => { if (S && S.lounge) { if (list) { fakePeers = list; S.lounge.others(list); } return S.lounge.peers(); } return null; }, emote: (k) => !!(S && S.lounge && S.lounge.emote(k)),
    sng: () => sngL, sngRead: () => sngRead().then(() => { if (mode === "lobby") paintLobby(); return sngL; }), sngEnd: (room) => { if (!R) R = { id: room.id, tok: {}, off: 0 }; mode = "table"; sngOver(room); },
    /// tests: end the solo game now (the hands so far count)
    finish: () => { if (G && !G.over) { Q.length = 0; latest = null; soloOver(); } },
    /// tests: blackjack
    bj: (k, ...a) => (k === "start" ? BJK.start() : k === "debug" ? BJK.debug() : k === "chip" ? BJK.chip(...a) : k === "table" ? BJK.table(...a) : BJK.press(k)),
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
Object.assign(LW.ko, {"Chip shop": "칩 상점", "Blackjack · practice": "블랙잭 · 연습", "Chips {b} · Bet {n}": "칩 {b} · 베팅 {n}", "Sign in with a wallet to play with your chips": "지갑으로 로그인하면 내 칩으로 플레이해요", "Out of chips for this table~ ♡": "이 테이블에 쓸 칩이 부족해요~ ♡", "Your round is still here": "진행 중이던 라운드가 그대로 있어요", "SOLO · PRACTICE": "솔로 · 연습", "vs ARCIA · your chips · blackjack pays 3 to 2": "vs ARCIA · 내 칩 · 블랙잭 3:2 지급", "vs ARCIA · practice chips · blackjack pays 3 to 2": "vs ARCIA · 연습 칩 · 블랙잭 3:2 지급", "buy chips with ARCL": "ARCL로 칩 구매", "Free chips every day, or buy chips with ARCL in the chip shop — chips never turn back into ARCL.": "칩은 매일 무료로 받거나 칩 상점에서 ARCL로 살 수 있어요 — 칩은 ARCL로 되돌릴 수 없어요.", "Texas Hold'em & Blackjack with ARCIA": "ARCIA와 텍사스 홀덤 & 블랙잭", "Sign in with a wallet to buy chips": "지갑으로 로그인하면 칩을 살 수 있어요", "Your chips": "내 칩", "Your ARCL": "내 ARCL", "chips": "칩", "Chips can't be turned back into ARCL. Buy only what you want to play with.": "칩은 ARCL로 되돌릴 수 없어요. 플레이할 만큼만 사세요.", "Up to {n} ARCL of chips a day · free chips every day too": "하루 최대 {n} ARCL어치 · 무료 칩도 매일 지급", "Buy {c} chips for {a} ARCL?": "{a} ARCL로 칩 {c}개를 살까요?", "Chips can't be turned back into ARCL.": "칩은 ARCL로 되돌릴 수 없어요.", "Buy": "구매", "Not enough chips": "칩이 부족해요", "That bet isn't allowed at this table": "이 테이블에서는 그 베팅을 할 수 없어요", "Finish the round first": "먼저 라운드를 끝내 주세요", "One moment…": "잠시만요…", "Not enough ARCL": "ARCL이 부족해요", "Today's chip limit is reached": "오늘의 칩 구매 한도에 도달했어요"});
Object.assign(LW.zh, {"Chip shop": "筹码商店", "Blackjack · practice": "二十一点 · 练习", "Chips {b} · Bet {n}": "筹码 {b} · 下注 {n}", "Sign in with a wallet to play with your chips": "用钱包登录即可用你的筹码游戏", "Out of chips for this table~ ♡": "筹码不够这张桌啦~ ♡", "Your round is still here": "你的这一局还在", "SOLO · PRACTICE": "单人 · 练习", "vs ARCIA · your chips · blackjack pays 3 to 2": "对战 ARCIA · 你的筹码 · 二十一点 3 赔 2", "vs ARCIA · practice chips · blackjack pays 3 to 2": "对战 ARCIA · 练习筹码 · 二十一点 3 赔 2", "buy chips with ARCL": "用 ARCL 买筹码", "Free chips every day, or buy chips with ARCL in the chip shop — chips never turn back into ARCL.": "每天有免费筹码，也可以在筹码商店用 ARCL 购买——筹码不能换回 ARCL。", "Texas Hold'em & Blackjack with ARCIA": "和 ARCIA 一起玩德州扑克和二十一点", "Sign in with a wallet to buy chips": "用钱包登录即可购买筹码", "Your chips": "你的筹码", "Your ARCL": "你的 ARCL", "chips": "筹码", "Chips can't be turned back into ARCL. Buy only what you want to play with.": "筹码不能换回 ARCL。只买你想玩的数量。", "Up to {n} ARCL of chips a day · free chips every day too": "每天最多 {n} ARCL 的筹码 · 每天也有免费筹码", "Buy {c} chips for {a} ARCL?": "用 {a} ARCL 购买 {c} 筹码？", "Chips can't be turned back into ARCL.": "筹码不能换回 ARCL。", "Buy": "购买", "Not enough chips": "筹码不够", "That bet isn't allowed at this table": "这张桌不允许这个下注", "Finish the round first": "请先完成这一局", "One moment…": "请稍等…", "Not enough ARCL": "ARCL 不够", "Today's chip limit is reached": "今日筹码购买已达上限"});
Object.assign(LW.tr, {"Chip shop": "Fiş dükkânı", "Blackjack · practice": "Blackjack · pratik", "Chips {b} · Bet {n}": "Fiş {b} · Bahis {n}", "Sign in with a wallet to play with your chips": "Fişlerinle oynamak için cüzdanla giriş yap", "Out of chips for this table~ ♡": "Bu masa için fişin kalmadı~ ♡", "Your round is still here": "Elin hâlâ burada", "SOLO · PRACTICE": "SOLO · PRATİK", "vs ARCIA · your chips · blackjack pays 3 to 2": "ARCIA'ya karşı · senin fişlerin · blackjack 3'e 2 öder", "vs ARCIA · practice chips · blackjack pays 3 to 2": "ARCIA'ya karşı · pratik fişleri · blackjack 3'e 2 öder", "buy chips with ARCL": "ARCL ile fiş al", "Free chips every day, or buy chips with ARCL in the chip shop — chips never turn back into ARCL.": "Her gün ücretsiz fiş, ya da fiş dükkânında ARCL ile fiş al — fişler asla ARCL'ye dönmez.", "Texas Hold'em & Blackjack with ARCIA": "ARCIA ile Texas Hold'em ve Blackjack", "Sign in with a wallet to buy chips": "Fiş almak için cüzdanla giriş yap", "Your chips": "Fişlerin", "Your ARCL": "ARCL'in", "chips": "fiş", "Chips can't be turned back into ARCL. Buy only what you want to play with.": "Fişler ARCL'ye geri çevrilemez. Sadece oynamak istediğin kadar al.", "Up to {n} ARCL of chips a day · free chips every day too": "Günde en fazla {n} ARCL'lik fiş · her gün ücretsiz fiş de var", "Buy {c} chips for {a} ARCL?": "{a} ARCL'ye {c} fiş alınsın mı?", "Chips can't be turned back into ARCL.": "Fişler ARCL'ye geri çevrilemez.", "Buy": "Satın al", "Not enough chips": "Yeterli fiş yok", "That bet isn't allowed at this table": "Bu masada bu bahis yapılamaz", "Finish the round first": "Önce eli bitir", "One moment…": "Bir saniye…", "Not enough ARCL": "Yeterli ARCL yok", "Today's chip limit is reached": "Bugünün fiş sınırı doldu"});
Object.assign(LW.ko, {"First purchase bonus: +{c} chips": "첫 구매 보너스: 칩 +{c}", "Festival stamp {n}/7!": "페스티벌 도장 {n}/7!", "{n} stamps: +{a} ARCL": "도장 {n}개: +{a} ARCL", "Unlocked: the Opening Night card back": "잠금 해제: 오프닝 나이트 카드 뒷면", "ROYAL FLUSH JACKPOT: +{c} chips · the title ARCIA's Chosen": "로열 플러시 잭팟: 칩 +{c} · 칭호 ARCIA's Chosen", "Three blackjacks in a row: +{c} chips": "블랙잭 3연속: 칩 +{c}", "Table Champion #{r}: +{c} chips · the Champion Gold felt": "테이블 챔피언 {r}위: 칩 +{c} · 챔피언 골드 펠트", "OPENING FESTIVAL": "오프닝 페스티벌", "Day {d}/{n} · {t} left": "{d}/{n}일차 · {t} 남음", "{d}d {h}h": "{d}일 {h}시간", "{h}h": "{h}시간", "HAPPY HOUR NOW: mission progress ×2": "지금 해피아워: 미션 진행 ×2", "10 table or blackjack hands a day = 1 stamp · today {n}/10": "하루 테이블·블랙잭 10핸드 = 도장 1개 · 오늘 {n}/10", "Sign in with a wallet to collect stamps": "지갑으로 로그인하면 도장을 모을 수 있어요", "ARCL at 3, 5 and 7 stamps": "도장 3·5·7개에 ARCL", "Free chips doubled: {n} a day": "무료 칩 2배: 하루 {n}", "First chip purchase: +50% chips": "첫 칩 구매: 칩 +50%", "Happy hour 20:00–22:00 (KST): mission progress ×2": "해피아워 20:00–22:00 (한국 시간): 미션 진행 ×2", "Royal flush at a table: +{a} chips · 3 blackjacks in a row: +{b}": "테이블에서 로열 플러시: 칩 +{a} · 블랙잭 3연속: +{b}", "This week's top 3 at the tables: {a} / {b} / {c} chips + the Champion Gold felt": "이번 주 테이블 TOP 3: 칩 {a} / {b} / {c} + 챔피언 골드 펠트", "Once a day each · paid for playing, never for winning": "각각 하루 한 번 · 플레이 보상이에요, 승리 보상이 아니에요", "Event": "이벤트", "Titles": "칭호", "Opening Festival: +50% chips on your first purchase": "오프닝 페스티벌: 첫 구매 칩 +50%", "Opening Night": "오프닝 나이트", "Champion Gold": "챔피언 골드", "Table Champion": "테이블 챔피언", "ARCIA's Chosen": "ARCIA의 선택"});
Object.assign(LW.zh, {"First purchase bonus: +{c} chips": "首次购买奖励：+{c} 筹码", "Festival stamp {n}/7!": "节日印章 {n}/7！", "{n} stamps: +{a} ARCL": "{n} 个印章：+{a} ARCL", "Unlocked: the Opening Night card back": "已解锁：开幕之夜牌背", "ROYAL FLUSH JACKPOT: +{c} chips · the title ARCIA's Chosen": "皇家同花顺大奖：+{c} 筹码 · 称号 ARCIA's Chosen", "Three blackjacks in a row: +{c} chips": "连续三次二十一点：+{c} 筹码", "Table Champion #{r}: +{c} chips · the Champion Gold felt": "牌桌冠军第 {r} 名：+{c} 筹码 · 冠军金桌布", "OPENING FESTIVAL": "开幕庆典", "Day {d}/{n} · {t} left": "第 {d}/{n} 天 · 剩余 {t}", "{d}d {h}h": "{d} 天 {h} 小时", "{h}h": "{h} 小时", "HAPPY HOUR NOW: mission progress ×2": "欢乐时光进行中：任务进度 ×2", "10 table or blackjack hands a day = 1 stamp · today {n}/10": "每天牌桌或二十一点 10 手 = 1 个印章 · 今天 {n}/10", "Sign in with a wallet to collect stamps": "用钱包登录即可收集印章", "ARCL at 3, 5 and 7 stamps": "3、5、7 个印章可得 ARCL", "Free chips doubled: {n} a day": "免费筹码翻倍：每天 {n}", "First chip purchase: +50% chips": "首次购买筹码：+50%", "Happy hour 20:00–22:00 (KST): mission progress ×2": "欢乐时光 20:00–22:00（韩国时间）：任务进度 ×2", "Royal flush at a table: +{a} chips · 3 blackjacks in a row: +{b}": "牌桌皇家同花顺：+{a} 筹码 · 连续三次二十一点：+{b}", "This week's top 3 at the tables: {a} / {b} / {c} chips + the Champion Gold felt": "本周牌桌前三名：{a} / {b} / {c} 筹码 + 冠军金桌布", "Once a day each · paid for playing, never for winning": "每项每天一次 · 奖励参与，从不奖励输赢", "Event": "活动", "Titles": "称号", "Opening Festival: +50% chips on your first purchase": "开幕庆典：首次购买筹码 +50%", "Opening Night": "开幕之夜", "Champion Gold": "冠军金", "Table Champion": "牌桌冠军", "ARCIA's Chosen": "ARCIA 之选"});
Object.assign(LW.tr, {"First purchase bonus: +{c} chips": "İlk alım bonusu: +{c} fiş", "Festival stamp {n}/7!": "Festival damgası {n}/7!", "{n} stamps: +{a} ARCL": "{n} damga: +{a} ARCL", "Unlocked: the Opening Night card back": "Açıldı: Açılış Gecesi kart arkası", "ROYAL FLUSH JACKPOT: +{c} chips · the title ARCIA's Chosen": "FLOŞ ROYAL JACKPOTU: +{c} fiş · ARCIA's Chosen unvanı", "Three blackjacks in a row: +{c} chips": "Üst üste üç blackjack: +{c} fiş", "Table Champion #{r}: +{c} chips · the Champion Gold felt": "Masa Şampiyonu #{r}: +{c} fiş · Şampiyon Altını çuha", "OPENING FESTIVAL": "AÇILIŞ FESTİVALİ", "Day {d}/{n} · {t} left": "Gün {d}/{n} · {t} kaldı", "{d}d {h}h": "{d}g {h}s", "{h}h": "{h}s", "HAPPY HOUR NOW: mission progress ×2": "ŞİMDİ HAPPY HOUR: görev ilerlemesi ×2", "10 table or blackjack hands a day = 1 stamp · today {n}/10": "Günde 10 masa ya da blackjack eli = 1 damga · bugün {n}/10", "Sign in with a wallet to collect stamps": "Damga toplamak için cüzdanla giriş yap", "ARCL at 3, 5 and 7 stamps": "3, 5 ve 7 damgada ARCL", "Free chips doubled: {n} a day": "Ücretsiz fiş iki katı: günde {n}", "First chip purchase: +50% chips": "İlk fiş alımı: +%50 fiş", "Happy hour 20:00–22:00 (KST): mission progress ×2": "Happy hour 20:00–22:00 (KST): görev ilerlemesi ×2", "Royal flush at a table: +{a} chips · 3 blackjacks in a row: +{b}": "Masada floş royal: +{a} fiş · üst üste 3 blackjack: +{b}", "This week's top 3 at the tables: {a} / {b} / {c} chips + the Champion Gold felt": "Bu haftanın masa ilk 3'ü: {a} / {b} / {c} fiş + Şampiyon Altını çuha", "Once a day each · paid for playing, never for winning": "Her biri günde bir kez · oynamak için, asla kazanmak için değil", "Event": "Etkinlik", "Titles": "Unvanlar", "Opening Festival: +50% chips on your first purchase": "Açılış Festivali: ilk alımda +%50 fiş", "Opening Night": "Açılış Gecesi", "Champion Gold": "Şampiyon Altını", "Table Champion": "Masa Şampiyonu", "ARCIA's Chosen": "ARCIA'nın Seçtiği"});

// share cards (world-share.js)
Object.assign(LW.ko, {"Share your royal flush": "로열 플러시 공유하기", "Hand": "핸드", "Cards": "카드", "Player": "플레이어", "Odds": "확률", "I hit a ROYAL FLUSH at ARCIA POKER LOUNGE! 🃏 {c}": "ARCIA POKER LOUNGE에서 로열 플러시가 떴어요! 🃏 {c}"});
Object.assign(LW.zh, {"Share your royal flush": "分享你的皇家同花顺", "Hand": "牌型", "Cards": "牌", "Player": "玩家", "Odds": "概率", "I hit a ROYAL FLUSH at ARCIA POKER LOUNGE! 🃏 {c}": "我在 ARCIA POKER LOUNGE 打出了皇家同花顺！🃏 {c}"});
Object.assign(LW.tr, {"Share your royal flush": "Royal flush'ını paylaş", "Hand": "El", "Cards": "Kartlar", "Player": "Oyuncu", "Odds": "Olasılık", "I hit a ROYAL FLUSH at ARCIA POKER LOUNGE! 🃏 {c}": "ARCIA POKER LOUNGE'da ROYAL FLUSH yaptım! 🃏 {c}"});
// b-pk3d: walking the lounge
Object.assign(LW.ko, {"ARCIA's table": "ARCIA의 테이블", "Play Hold'em": "홀덤 하기", "Blackjack": "블랙잭", "Chips & missions": "칩 & 미션", "This week's board": "이번 주 순위판", "Card backs & felts": "카드 뒷면 & 테이블 천", "Profile & style": "프로필 & 스타일", "Back to town": "마을로 돌아가기", "Lounge menu": "라운지 메뉴", "Walk with the stick, or tap a sign": "스틱으로 걷거나, 표지판을 눌러 이동해요", "Walk with WASD or the arrows, or click a sign · E to use": "WASD나 방향키로 걷거나, 표지판을 클릭해요 · E로 사용", "practice": "연습"});
Object.assign(LW.zh, {"ARCIA's table": "ARCIA 的牌桌", "Play Hold'em": "玩德州扑克", "Blackjack": "二十一点", "Chips & missions": "筹码与任务", "This week's board": "本周排行榜", "Card backs & felts": "牌背与桌布", "Profile & style": "资料与风格", "Back to town": "返回小镇", "Lounge menu": "休息室菜单", "Walk with the stick, or tap a sign": "用摇杆行走，或点击指示牌前往", "Walk with WASD or the arrows, or click a sign · E to use": "用 WASD 或方向键行走，或点击指示牌 · 按 E 使用", "practice": "练习"});
Object.assign(LW.tr, {"ARCIA's table": "ARCIA'nın masası", "Play Hold'em": "Hold'em oyna", "Blackjack": "Blackjack", "Chips & missions": "Fişler ve görevler", "This week's board": "Bu haftanın tablosu", "Card backs & felts": "Kart arkaları ve çuhalar", "Profile & style": "Profil ve stil", "Back to town": "Kasabaya dön", "Lounge menu": "Salon menüsü", "Walk with the stick, or tap a sign": "Çubukla yürü ya da bir tabelaya dokun", "Walk with WASD or the arrows, or click a sign · E to use": "WASD ya da oklarla yürü veya bir tabelaya tıkla · kullanmak için E", "practice": "pratik"});
// b-pky: poker batch 1
Object.assign(LW.ko, {"Before your turn": "내 차례 전에 미리", "Check / Fold": "체크 / 폴드", "Call any": "아무거나 콜", "Call": "콜", "Check": "체크", "Flush + straight draw · {n} outs": "플러시 + 스트레이트 드로우 · 아웃 {n}장", "Flush draw · {n} outs": "플러시 드로우 · 아웃 {n}장", "Open-ended straight draw · {n} outs": "양방향 스트레이트 드로우 · 아웃 {n}장", "Gutshot straight draw · {n} outs": "거트샷 스트레이트 드로우 · 아웃 {n}장", "All in?! So brave~ ♡": "올인?! 용감해요~ ♡", "Ooh, all in~!": "오, 올인이에요~!", "Won with that?! What nerve~ ♡": "그 패로 이겼어요?! 배짱 대단해요~ ♡", "{n} hands · {c} chips each · blinds rise every {k} hands": "{n}핸드 · 각자 칩 {c} · {k}핸드마다 블라인드 상승", "Game length": "게임 길이", "Quick {n}": "짧게 {n}", "Long {n}": "길게 {n}"});
Object.assign(LW.zh, {"Before your turn": "轮到你之前", "Check / Fold": "过牌 / 弃牌", "Call any": "跟任何注", "Call": "跟注", "Check": "过牌", "Flush + straight draw · {n} outs": "同花 + 顺子听牌 · {n} 张出路", "Flush draw · {n} outs": "同花听牌 · {n} 张出路", "Open-ended straight draw · {n} outs": "两头顺子听牌 · {n} 张出路", "Gutshot straight draw · {n} outs": "卡顺听牌 · {n} 张出路", "All in?! So brave~ ♡": "全下？！好勇敢~ ♡", "Ooh, all in~!": "哇，全下了~！", "Won with that?! What nerve~ ♡": "就靠这手牌赢了？！好胆量~ ♡", "{n} hands · {c} chips each · blinds rise every {k} hands": "{n} 手 · 每人 {c} 筹码 · 每 {k} 手升盲", "Game length": "对局长度", "Quick {n}": "快速 {n}", "Long {n}": "长局 {n}"});
Object.assign(LW.tr, {"Before your turn": "Sıran gelmeden", "Check / Fold": "Kontrol / Pas", "Call any": "Her bahsi gör", "Call": "Gör", "Check": "Kontrol", "Flush + straight draw · {n} outs": "Floş + kent beklentisi · {n} out", "Flush draw · {n} outs": "Floş beklentisi · {n} out", "Open-ended straight draw · {n} outs": "Açık uçlu kent beklentisi · {n} out", "Gutshot straight draw · {n} outs": "İçten kent beklentisi · {n} out", "All in?! So brave~ ♡": "All-in mi?! Ne cesaret~ ♡", "Ooh, all in~!": "Ooh, all-in~!", "Won with that?! What nerve~ ♡": "Bununla mı kazandın?! Ne cesaret~ ♡", "{n} hands · {c} chips each · blinds rise every {k} hands": "{n} el · herkese {c} fiş · körler her {k} elde artar", "Game length": "Oyun uzunluğu", "Quick {n}": "Kısa {n}", "Long {n}": "Uzun {n}"});
// b-pky2: the Sit & Go, the lounge's emotes and presence
Object.assign(LW.ko, {"Sit & Go · Level {l} · Blinds {b} · {n} left": "싯앤고 · 레벨 {l} · 블라인드 {b} · {n}명 남음", "Your Sit & Go is starting — to your seat!": "싯앤고가 시작돼요 — 자리로 가요!", "{h}h {m}m": "{h}시간 {m}분", "{m} min": "{m}분", "SIT & GO": "싯앤고", "Every 2 hours · 6 seats": "2시간마다 · 6석", "Starts in {t}": "{t} 후 시작", "Playing now": "진행 중", "Won by {name}": "우승 {name}", "Finished": "종료", "Signed up": "참가 신청함", "Sign up": "참가 신청", "To your seat": "내 자리로", "Every 2 hours · 6 seats · {c} tournament chips · blinds up every {k} hands": "2시간마다 · 6석 · 토너먼트 칩 {c} · {k}핸드마다 블라인드 상승", "Entry in chips (back if you cancel before it starts) · computers fill the empty seats · prizes for the top 3 in chips + poker XP · the winner's title": "참가비는 칩 (시작 전에 취소하면 돌려받아요) · 빈자리는 컴퓨터가 채워요 · 상위 3명에게 칩 + 포커 경험치 · 우승자 칭호", "Sign in with a wallet to sign up": "지갑으로 로그인하면 참가 신청할 수 있어요", "Signed up — it starts at {t}": "참가 신청 완료 — {t}에 시작해요", "SIT & GO CHAMPION!": "싯앤고 챔피언!", "Sit & Go · the places": "싯앤고 · 최종 순위", "Your place: {n} · +{c} chips and poker XP": "내 순위: {n}위 · +{c}칩과 포커 경험치", "Your place: {n}": "내 순위: {n}위", "Watching": "관전 중", "{n} more in the lounge": "라운지에 {n}명 더 있어요", "Wave": "손 흔들기", "Cheer": "환호", "Laugh": "웃음", "Love": "하트", "Good game": "굿 게임", "Dance": "춤", "Not enough chips for the entry": "참가비 칩이 부족해요", "This Sit & Go is full": "이 싯앤고는 꽉 찼어요", "This Sit & Go has started": "이 싯앤고는 이미 시작했어요", "Sign-up isn't open yet": "아직 참가 신청을 받지 않아요"});
Object.assign(LW.zh, {"Sit & Go · Level {l} · Blinds {b} · {n} left": "坐满即玩 · 第 {l} 级 · 盲注 {b} · 剩 {n} 人", "Your Sit & Go is starting — to your seat!": "你的坐满即玩开始了——快入座！", "{h}h {m}m": "{h}小时{m}分", "{m} min": "{m} 分钟", "SIT & GO": "坐满即玩", "Every 2 hours · 6 seats": "每 2 小时 · 6 个座位", "Starts in {t}": "{t}后开始", "Playing now": "进行中", "Won by {name}": "冠军 {name}", "Finished": "已结束", "Signed up": "已报名", "Sign up": "报名", "To your seat": "回到座位", "Every 2 hours · 6 seats · {c} tournament chips · blinds up every {k} hands": "每 2 小时 · 6 个座位 · {c} 锦标赛筹码 · 每 {k} 手升盲", "Entry in chips (back if you cancel before it starts) · computers fill the empty seats · prizes for the top 3 in chips + poker XP · the winner's title": "报名费为筹码（开赛前取消会退还）· 空位由电脑补上 · 前三名获得筹码 + 扑克经验 · 冠军称号", "Sign in with a wallet to sign up": "用钱包登录即可报名", "Signed up — it starts at {t}": "报名成功——{t} 开赛", "SIT & GO CHAMPION!": "坐满即玩冠军！", "Sit & Go · the places": "坐满即玩 · 最终名次", "Your place: {n} · +{c} chips and poker XP": "你的名次：第 {n} 名 · +{c} 筹码和扑克经验", "Your place: {n}": "你的名次：第 {n} 名", "Watching": "观战中", "{n} more in the lounge": "酒廊里还有 {n} 人", "Wave": "挥手", "Cheer": "欢呼", "Laugh": "大笑", "Love": "爱心", "Good game": "打得好", "Dance": "跳舞", "Not enough chips for the entry": "报名筹码不足", "This Sit & Go is full": "这场坐满即玩已满", "This Sit & Go has started": "这场坐满即玩已开始", "Sign-up isn't open yet": "还没开放报名"});
Object.assign(LW.tr, {"Sit & Go · Level {l} · Blinds {b} · {n} left": "Sit & Go · Seviye {l} · Körler {b} · {n} kişi kaldı", "Your Sit & Go is starting — to your seat!": "Sit & Go'n başlıyor — yerine geç!", "{h}h {m}m": "{h}sa {m}dk", "{m} min": "{m} dk", "SIT & GO": "SIT & GO", "Every 2 hours · 6 seats": "Her 2 saatte · 6 koltuk", "Starts in {t}": "{t} sonra başlıyor", "Playing now": "Şu an oynanıyor", "Won by {name}": "Kazanan {name}", "Finished": "Bitti", "Signed up": "Kayıtlısın", "Sign up": "Kaydol", "To your seat": "Yerine geç", "Every 2 hours · 6 seats · {c} tournament chips · blinds up every {k} hands": "Her 2 saatte · 6 koltuk · {c} turnuva fişi · körler her {k} elde artar", "Entry in chips (back if you cancel before it starts) · computers fill the empty seats · prizes for the top 3 in chips + poker XP · the winner's title": "Giriş fişle (başlamadan iptal edersen geri) · boş koltukları bilgisayar doldurur · ilk 3'e fiş + poker XP · kazanana unvan", "Sign in with a wallet to sign up": "Kaydolmak için cüzdanla giriş yap", "Signed up — it starts at {t}": "Kaydoldun — {t}'de başlıyor", "SIT & GO CHAMPION!": "SIT & GO ŞAMPİYONU!", "Sit & Go · the places": "Sit & Go · sıralama", "Your place: {n} · +{c} chips and poker XP": "Sıran: {n} · +{c} fiş ve poker XP", "Your place: {n}": "Sıran: {n}", "Watching": "İzliyorsun", "{n} more in the lounge": "Salonda {n} kişi daha var", "Wave": "El salla", "Cheer": "Tezahürat", "Laugh": "Gül", "Love": "Sevgi", "Good game": "İyi oyun", "Dance": "Dans", "Not enough chips for the entry": "Giriş için yeterli fişin yok", "This Sit & Go is full": "Bu Sit & Go dolu", "This Sit & Go has started": "Bu Sit & Go başladı", "Sign-up isn't open yet": "Kayıt henüz açık değil"});
// b-pky3: history, badges, the daily rule, the tutorial, looks for chips, crews, the computers' words, side bets
Object.assign(LW.ko, {"#{p} of {n}": "{n}명 중 {p}위", "21+3: {x}! +{n}": "21+3: {x}! +{n}", "3 hands with ARCIA by your side": "ARCIA와 함께하는 3핸드", "3,000 chips each": "각자 3,000칩", "5 AI players at Hard": "하드 AI 5명", "All-Star Table": "올스타 테이블", "All-in Hero": "올인 히어로", "All-ins won": "올인 승리", "Badges": "배지", "Big Pot Hunter": "빅 팟 헌터", "Biggest pot": "가장 큰 팟", "Blinds double every 2 hands": "2핸드마다 블라인드 2배", "Blinds start at 20/40": "블라인드 20/40부터", "Bluff Master": "블러프 마스터", "Board": "보드", "Card Shark": "카드 샤크", "Careful now~": "조심조심~", "Coloured pair": "컬러 페어", "Crew table": "크루 테이블", "Crew tables": "크루 테이블", "Crews this week": "이번 주 크루 순위", "Decent~ A call is fine here.": "괜찮아요~ 여기선 콜이 좋아요.", "Deep Stacks": "딥 스택", "Do I have it? 😏": "내가 가졌을까? 😏", "Double Blinds": "블라인드 2배", "Each is the table's least bet × 5 (at most your bet), paid as the cards land.": "각각 테이블 최소 베팅 × 5(내 베팅 이하), 카드가 깔리면 바로 정산돼요.", "Earned": "획득", "Fair bet.": "좋은 베팅이네요.", "Feeling lucky…": "운이 좋은 느낌…", "Finish": "순위", "Galaxy": "갤럭시", "Get {x} for {c} chips?": "{x}을(를) {c}칩에 살까요?", "Hands played": "플레이한 핸드", "Heads-up vs NEX": "NEX와 1:1", "I WON THE GAME!": "게임에서 이겼어요!", "I just played ARCIA POKER LOUNGE: #{p} of {n}, best hand {h}! 🃏": "ARCIA POKER LOUNGE에서 {n}명 중 {p}위, 최고 핸드 {h}! 🃏", "I'll call that!": "콜할게요!", "I've got something.": "좋은 게 있어요.", "Iron Seat": "아이언 시트", "Join or start a crew (Menu → Crew) to open tables just for your crew": "크루에 가입하거나 만들면(메뉴 → 크루) 크루 전용 테이블을 열 수 있어요", "LEARN IN 3 HANDS": "3핸드로 배우기", "Let's play.": "해봐요.", "Let's see it!": "보여줘요!", "Lounge Student": "라운지 학생", "Mixed pair": "믹스 페어", "Money in by choice": "자발적 베팅 비율", "My cards": "내 카드", "My hand at ARCIA POKER LOUNGE: {c} → {h} 🃏": "ARCIA POKER LOUNGE의 내 핸드: {c} → {h} 🃏", "NEW TO POKER?": "포커는 처음인가요?", "NEX pushes · LUMI is careful · ARON bluffs · ARC plays it straight · MINT calls a lot": "NEX는 공격형 · LUMI는 신중형 · ARON은 블러퍼 · ARC는 정석 · MINT는 콜을 자주 해요", "Neon": "네온", "New badge: {b}": "새 배지: {b}", "No crew on the board yet — play a crew table!": "아직 순위에 오른 크루가 없어요 — 크루 테이블에서 플레이해요!", "No crew table open — start one": "열린 크루 테이블이 없어요 — 하나 열어 보세요", "No one on today's board yet — be the first!": "오늘 순위판은 아직 비었어요 — 첫 번째가 되세요!", "No pot won": "딴 팟 없음", "Not bad~ Check: it's free to see more.": "나쁘지 않아요~ 체크하면 공짜로 더 볼 수 있어요.", "Ocean": "오션", "Only the good ones.": "좋은 패만 베팅해요.", "PLAY TODAY'S RULE": "오늘의 룰 플레이", "Perfect Pairs": "퍼펙트 페어", "Perfect Pairs: {x}! +{n}": "퍼펙트 페어: {x}! +{n}", "Perfect pair": "퍼펙트 페어", "Pot Collector": "팟 컬렉터", "Pots won": "딴 팟", "Pressure's on! 🔥": "압박 들어갑니다! 🔥", "Raise it up!": "올려요!", "Read me if you can~": "읽을 수 있으면 읽어봐요~", "Recent hands": "최근 핸드", "Regular Seat": "단골손님", "Royal Blue": "로열 블루", "Ruby": "루비", "Rule Breaker": "룰 브레이커", "Sakura": "사쿠라", "Share": "공유", "Share this hand": "이 핸드 공유하기", "Showdown King": "쇼다운 킹", "Showdowns won": "쇼다운 승리", "Side bets": "사이드 베팅", "Side bets: no luck this time": "사이드 베팅: 이번엔 아쉬워요", "Sign in with a wallet to buy looks with chips": "지갑으로 로그인하면 칩으로 꾸미기를 살 수 있어요", "Solo": "솔로", "Start a crew table": "크루 테이블 열기", "Straight flush": "스트레이트 플러시", "Strong hand~ Bet or raise to win more! ♡": "강한 패예요~ 베팅이나 레이즈로 더 따요! ♡", "Suited trips": "같은 무늬 트리플", "TODAY'S RULE": "오늘의 룰", "TUTORIAL DONE!": "튜토리얼 완료!", "The flop: three shared cards. The bar under your cards shows your chance~": "플랍: 공유 카드 3장이에요. 내 카드 아래 막대가 이길 확률이에요~", "These two cards are yours~ Five shared cards come to the middle. Make the best five! ♡": "이 두 장이 내 카드예요~ 공유 카드 5장이 가운데에 깔려요. 가장 좋은 다섯 장을 만들어요! ♡", "Three of a kind": "트리플", "Today's rule · {r}": "오늘의 룰 · {r}", "Too slow~": "너무 느려요~", "Turbo Blinds": "터보 블라인드", "Tutorial complete! ♡": "튜토리얼 완료! ♡", "Tutorial · 3 hands": "튜토리얼 · 3핸드", "Weak… folding is fine here. There's always the next hand~": "약해요… 여기선 폴드해도 괜찮아요. 다음 핸드가 있어요~", "Why not~": "왜 안 돼~", "Won the pot": "팟 획득", "You know the game now~ Try a real one! ♡": "이제 게임을 알겠죠~ 진짜 게임도 해봐요! ♡", "You vs AI NEX at Expert": "엑스퍼트 AI NEX와 1:1", "Your last 20 hands show here — replay and share them": "최근 20핸드가 여기에 보여요 — 다시 보고 공유해요", "Your play": "내 플레이", "Your turn~ Let me look at your cards…": "내 차례예요~ 카드를 볼게요…", "Yours to keep · chips don't come back": "계속 내 것 · 칩은 돌아오지 않아요", "your first two cards": "내 처음 두 장", "your two + ARCIA's up card": "내 두 장 + ARCIA의 보이는 카드", "{n} big blinds": "빅 블라인드 {n}개", "{n} hands": "{n}핸드"});
Object.assign(LW.zh, {"#{p} of {n}": "{n} 人中第 {p}", "21+3: {x}! +{n}": "21+3：{x}！+{n}", "3 hands with ARCIA by your side": "ARCIA 陪你打 3 手", "3,000 chips each": "每人 3,000 筹码", "5 AI players at Hard": "5 个困难 AI", "All-Star Table": "全明星牌桌", "All-in Hero": "全下英雄", "All-ins won": "全下获胜", "Badges": "徽章", "Big Pot Hunter": "大底池猎人", "Biggest pot": "最大底池", "Blinds double every 2 hands": "每 2 手盲注翻倍", "Blinds start at 20/40": "盲注从 20/40 起", "Bluff Master": "诈唬大师", "Board": "公共牌", "Card Shark": "牌桌鲨鱼", "Careful now~": "小心点~", "Coloured pair": "同色对子", "Crew table": "战队牌桌", "Crew tables": "战队牌桌", "Crews this week": "本周战队榜", "Decent~ A call is fine here.": "还不错~ 这里跟注就好。", "Deep Stacks": "深筹码", "Do I have it? 😏": "我有没有呢？😏", "Double Blinds": "双倍盲注", "Each is the table's least bet × 5 (at most your bet), paid as the cards land.": "每项为牌桌最低注 × 5（不超过你的主注），发牌后立即结算。", "Earned": "已获得", "Fair bet.": "公平的下注。", "Feeling lucky…": "感觉运气不错…", "Finish": "名次", "Galaxy": "星河", "Get {x} for {c} chips?": "用 {c} 筹码购买 {x}？", "Hands played": "已玩手数", "Heads-up vs NEX": "单挑 NEX", "I WON THE GAME!": "我赢了这局！", "I just played ARCIA POKER LOUNGE: #{p} of {n}, best hand {h}! 🃏": "我刚在 ARCIA POKER LOUNGE 打出 {n} 人中第 {p}，最佳牌型 {h}！🃏", "I'll call that!": "我跟！", "I've got something.": "我有好牌。", "Iron Seat": "铁座", "Join or start a crew (Menu → Crew) to open tables just for your crew": "加入或创建战队（菜单 → 战队）即可开战队专属牌桌", "LEARN IN 3 HANDS": "3 手学会", "Let's play.": "来玩吧。", "Let's see it!": "亮牌看看！", "Lounge Student": "休息室学员", "Mixed pair": "混色对子", "Money in by choice": "主动入池率", "My cards": "我的牌", "My hand at ARCIA POKER LOUNGE: {c} → {h} 🃏": "我在 ARCIA POKER LOUNGE 的一手牌：{c} → {h} 🃏", "NEW TO POKER?": "刚接触扑克？", "NEX pushes · LUMI is careful · ARON bluffs · ARC plays it straight · MINT calls a lot": "NEX 激进 · LUMI 谨慎 · ARON 爱诈唬 · ARC 稳健 · MINT 爱跟注", "Neon": "霓虹", "New badge: {b}": "新徽章：{b}", "No crew on the board yet — play a crew table!": "榜上还没有战队——来战队牌桌玩吧！", "No crew table open — start one": "没有开着的战队牌桌——开一张吧", "No one on today's board yet — be the first!": "今日榜单还是空的——来当第一！", "No pot won": "没有赢下底池", "Not bad~ Check: it's free to see more.": "不错~ 过牌可以免费多看一张。", "Ocean": "海洋", "Only the good ones.": "只打好牌。", "PLAY TODAY'S RULE": "玩今日规则", "Perfect Pairs": "完美对子", "Perfect Pairs: {x}! +{n}": "完美对子：{x}！+{n}", "Perfect pair": "完美对子", "Pot Collector": "底池收藏家", "Pots won": "赢下的底池", "Pressure's on! 🔥": "施压了！🔥", "Raise it up!": "加注！", "Read me if you can~": "有本事就读我~", "Recent hands": "最近的牌局", "Regular Seat": "常客", "Royal Blue": "皇家蓝", "Ruby": "红宝石", "Rule Breaker": "规则破坏者", "Sakura": "樱花", "Share": "分享", "Share this hand": "分享这手牌", "Showdown King": "摊牌之王", "Showdowns won": "摊牌获胜", "Side bets": "边注", "Side bets: no luck this time": "边注：这次没中", "Sign in with a wallet to buy looks with chips": "用钱包登录即可用筹码购买外观", "Solo": "单人", "Start a crew table": "开战队牌桌", "Straight flush": "同花顺", "Strong hand~ Bet or raise to win more! ♡": "好牌~ 下注或加注赢更多！♡", "Suited trips": "同花三条", "TODAY'S RULE": "今日规则", "TUTORIAL DONE!": "教程完成！", "The flop: three shared cards. The bar under your cards shows your chance~": "翻牌：三张公共牌。你牌下面的条显示你的胜率~", "These two cards are yours~ Five shared cards come to the middle. Make the best five! ♡": "这两张是你的牌~ 中间会发五张公共牌。组成最好的五张！♡", "Three of a kind": "三条", "Today's rule · {r}": "今日规则 · {r}", "Too slow~": "太慢啦~", "Turbo Blinds": "极速盲注", "Tutorial complete! ♡": "教程完成！♡", "Tutorial · 3 hands": "教程 · 3 手", "Weak… folding is fine here. There's always the next hand~": "牌弱…这里弃牌也没关系。还有下一手~", "Why not~": "为什么不呢~", "Won the pot": "赢下底池", "You know the game now~ Try a real one! ♡": "现在你会玩了~ 来一局真的吧！♡", "You vs AI NEX at Expert": "你对战专家 AI NEX", "Your last 20 hands show here — replay and share them": "最近 20 手牌显示在这里——可回放和分享", "Your play": "我的打法", "Your turn~ Let me look at your cards…": "轮到你啦~ 我看看你的牌…", "Yours to keep · chips don't come back": "永久拥有 · 筹码不退回", "your first two cards": "你的前两张牌", "your two + ARCIA's up card": "你的两张 + ARCIA 的明牌", "{n} big blinds": "{n} 个大盲", "{n} hands": "{n} 手"});
Object.assign(LW.tr, {"#{p} of {n}": "{n} kişiden {p}.", "21+3: {x}! +{n}": "21+3: {x}! +{n}", "3 hands with ARCIA by your side": "ARCIA yanında 3 el", "3,000 chips each": "Herkese 3.000 fiş", "5 AI players at Hard": "Zor seviyede 5 yapay zekâ", "All-Star Table": "Yıldızlar Masası", "All-in Hero": "All-in Kahramanı", "All-ins won": "Kazanılan all-in", "Badges": "Rozetler", "Big Pot Hunter": "Büyük Pot Avcısı", "Biggest pot": "En büyük pot", "Blinds double every 2 hands": "Körler her 2 elde ikiye katlanır", "Blinds start at 20/40": "Körler 20/40'tan başlar", "Bluff Master": "Blöf Ustası", "Board": "Masa", "Card Shark": "Kart Köpekbalığı", "Careful now~": "Dikkatli olalım~", "Coloured pair": "Renkli çift", "Crew table": "Ekip masası", "Crew tables": "Ekip masaları", "Crews this week": "Bu haftanın ekipleri", "Decent~ A call is fine here.": "Fena değil~ Burada görmek yeterli.", "Deep Stacks": "Derin Fişler", "Do I have it? 😏": "Bende var mı? 😏", "Double Blinds": "Çift Körler", "Each is the table's least bet × 5 (at most your bet), paid as the cards land.": "Her biri masanın en düşük bahsi × 5 (en fazla ana bahsin), kartlar gelince ödenir.", "Earned": "Kazanıldı", "Fair bet.": "Adil bahis.", "Feeling lucky…": "Şanslı hissediyorum…", "Finish": "Sıra", "Galaxy": "Galaksi", "Get {x} for {c} chips?": "{x} için {c} fiş ödensin mi?", "Hands played": "Oynanan el", "Heads-up vs NEX": "NEX'e karşı tek tek", "I WON THE GAME!": "OYUNU KAZANDIM!", "I just played ARCIA POKER LOUNGE: #{p} of {n}, best hand {h}! 🃏": "ARCIA POKER LOUNGE'da {n} kişiden {p}. oldum, en iyi el {h}! 🃏", "I'll call that!": "Görüyorum!", "I've got something.": "Elimde bir şey var.", "Iron Seat": "Demir Koltuk", "Join or start a crew (Menu → Crew) to open tables just for your crew": "Sadece ekibine açık masalar için bir ekibe katıl ya da kur (Menü → Ekip)", "LEARN IN 3 HANDS": "3 ELDE ÖĞREN", "Let's play.": "Oynayalım.", "Let's see it!": "Görelim!", "Lounge Student": "Salon Öğrencisi", "Mixed pair": "Karışık çift", "Money in by choice": "Gönüllü para koyma", "My cards": "Kartlarım", "My hand at ARCIA POKER LOUNGE: {c} → {h} 🃏": "ARCIA POKER LOUNGE'daki elim: {c} → {h} 🃏", "NEW TO POKER?": "POKERDE YENİ MİSİN?", "NEX pushes · LUMI is careful · ARON bluffs · ARC plays it straight · MINT calls a lot": "NEX baskıcı · LUMI temkinli · ARON blöfçü · ARC dürüst oynar · MINT çok görür", "Neon": "Neon", "New badge: {b}": "Yeni rozet: {b}", "No crew on the board yet — play a crew table!": "Tabloda henüz ekip yok — bir ekip masasında oyna!", "No crew table open — start one": "Açık ekip masası yok — bir tane aç", "No one on today's board yet — be the first!": "Bugünün tablosu boş — ilk sen ol!", "No pot won": "Kazanılan pot yok", "Not bad~ Check: it's free to see more.": "Fena değil~ Kontrol et: daha fazlasını görmek bedava.", "Ocean": "Okyanus", "Only the good ones.": "Sadece iyi eller.", "PLAY TODAY'S RULE": "BUGÜNÜN KURALINI OYNA", "Perfect Pairs": "Perfect Pairs", "Perfect Pairs: {x}! +{n}": "Perfect Pairs: {x}! +{n}", "Perfect pair": "Mükemmel çift", "Pot Collector": "Pot Koleksiyoncusu", "Pots won": "Kazanılan pot", "Pressure's on! 🔥": "Baskı başladı! 🔥", "Raise it up!": "Yükselt!", "Read me if you can~": "Okuyabilirsen oku~", "Recent hands": "Son eller", "Regular Seat": "Müdavim", "Royal Blue": "Kraliyet Mavisi", "Ruby": "Yakut", "Rule Breaker": "Kural Bozan", "Sakura": "Sakura", "Share": "Paylaş", "Share this hand": "Bu eli paylaş", "Showdown King": "Showdown Kralı", "Showdowns won": "Kazanılan showdown", "Side bets": "Yan bahisler", "Side bets: no luck this time": "Yan bahisler: bu sefer olmadı", "Sign in with a wallet to buy looks with chips": "Fişle görünüm almak için cüzdanla giriş yap", "Solo": "Solo", "Start a crew table": "Ekip masası aç", "Straight flush": "Floş kent", "Strong hand~ Bet or raise to win more! ♡": "Güçlü el~ Daha çok kazanmak için bahis yap ya da yükselt! ♡", "Suited trips": "Aynı renk üçlü", "TODAY'S RULE": "BUGÜNÜN KURALI", "TUTORIAL DONE!": "EĞİTİM TAMAM!", "The flop: three shared cards. The bar under your cards shows your chance~": "Flop: üç ortak kart. Kartlarının altındaki çubuk şansını gösterir~", "These two cards are yours~ Five shared cards come to the middle. Make the best five! ♡": "Bu iki kart senin~ Ortaya beş ortak kart gelir. En iyi beşliyi yap! ♡", "Three of a kind": "Üçlü", "Today's rule · {r}": "Bugünün kuralı · {r}", "Too slow~": "Çok yavaş~", "Turbo Blinds": "Turbo Körler", "Tutorial complete! ♡": "Eğitim tamam! ♡", "Tutorial · 3 hands": "Eğitim · 3 el", "Weak… folding is fine here. There's always the next hand~": "Zayıf… burada pas geçmek sorun değil. Bir sonraki el var~", "Why not~": "Neden olmasın~", "Won the pot": "Potu kazandın", "You know the game now~ Try a real one! ♡": "Artık oyunu biliyorsun~ Gerçek bir tane dene! ♡", "You vs AI NEX at Expert": "Uzman NEX'e karşı sen", "Your last 20 hands show here — replay and share them": "Son 20 elin burada — tekrar izle ve paylaş", "Your play": "Oyunun", "Your turn~ Let me look at your cards…": "Sıran~ Kartlarına bakayım…", "Yours to keep · chips don't come back": "Senin olur · fişler geri gelmez", "your first two cards": "ilk iki kartın", "your two + ARCIA's up card": "iki kartın + ARCIA'nın açık kartı", "{n} big blinds": "{n} büyük kör", "{n} hands": "{n} el"});
