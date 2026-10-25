// world-mythic.js — the Crimson Celestial set's window (world-mythic-data.js; the pieces are the server's: api/_world-mythic.mjs):
// your hero in the middle with the seven slots round it (empty ones as shadows, with their chance of being the next drop),
// the bonuses as a track to the next one, the week's blessed slot, the picked slot's sheet (the piece in 3D — drag to turn,
// pinch to zoom —, a comparison with what you wear now, wear / enhance with its odds / awaken / reforge / sell / salvage,
// each piece's own story), Crimson Shards (pick a slot when a dungeon's shards are full), the market (filters, watched
// pieces, the price line of recent sales, buy requests) and the boards. And the moments: a drop's reveal, wearing one,
// a set bonus reached, an enhance's hammer, share cards for the big ones.
//   ctx: { THREE, K, T, esc, post(b), sess(), level(), state() → { pieces, eq, ess, shards, now } | null, refresh() → Promise,
//          toast(html), freeze(on), ver, Snd, hero() → "aron" | "lumi" | "nex", eqItem(slot) → the regular piece worn there,
//          share(card), purse(), reduce }
import { CC, pieceOf, mythicStats, setBonus, enhCost, essOf, slotOdds, blessedSlot, weekNo, reforgeCost } from "./world-mythic-data.js";
import { itemStats } from "./world-rpg-data.js";

const STAT = { atk: "ATK", def: "DEF", hp: "HP", sp: "SP", crit: "Crit %", spd: "Speed", critDmg: "Crit DMG %", skillPct: "Skill DMG %", dr: "DMG taken −%", atkPct: "ATK %", defPct: "DEF %", hpPct: "HP %" };
const SRC = { lysitha: "Lv 100 · Lysitha", solvira: "Lv 200 · Solvira", nyxara: "Lv 300 · Nyxara", throne: "Lv 400 · Throne of Three", secret: "SECRET" };
const SLOT_NAME = { weapon: "Weapon", shield: "Shield", armor: "Armor", helm: "Helmet", ring: "Ring", boots: "Boots", necklace: "Necklace" };
// the slots round the hero, clockwise from the top
const RING = ["helm", "necklace", "ring", "boots", "shield", "weapon", "armor"];
const img = (P, ver) => `/images/mythic/${P.glb}.webp${ver || ""}`;
const fmtN = (n) => Number(n || 0).toLocaleString("en-US");

// the pieces in 3D (the owner's Meshy models, ~7 k triangles, 512 px KTX2: models/world/mythic): one small renderer of its
// own, made when a piece is shown and let go when the window closes; a slow turn, a red rim, a soft floor with the piece
// mirrored in it; drag turns it, a pinch (or the wheel) brings it closer, and it turns by itself again after a moment
function makeViewer(THREE, K) {
  let R = null, scene = null, cam = null, raf = 0, obj = null, mir = null, host = null, t0 = 0, yaw = 0, zoom = 3.2, idleAt = 0;
  const cache = {}, ptr = new Map(); let pinch0 = 0, zoom0 = 3.2;
  function ensure() {
    if (R) return; R = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); R.setPixelRatio(Math.min(2, devicePixelRatio || 1)); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping;
    scene = new THREE.Scene(); cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50); cam.position.set(0, 0.25, zoom);
    scene.add(new THREE.HemisphereLight(0xffe6ee, 0x200810, 1.6)); const k = new THREE.DirectionalLight(0xffffff, 2.4); k.position.set(2, 3, 2); scene.add(k);
    const rim = new THREE.DirectionalLight(0xff3d6e, 3); rim.position.set(-2.5, 1, -2); scene.add(rim);
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, "rgba(255,61,110,0.55)"); gr.addColorStop(0.6, "rgba(120,10,40,0.25)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.92; scene.add(floor);
  }
  const load = (glb, ver) => cache[glb] || (cache[glb] = new Promise((ok, no) => K.gltfLoader().load(`/models/world/mythic/${glb}.glb${ver || ""}`, (g) => ok(g.scene), undefined, no)).catch((e) => { delete cache[glb]; throw e; }));
  function loop(t) { raf = requestAnimationFrame(loop); if (!host || !host.isConnected) { stop(); return; } const w = host.clientWidth, h = host.clientHeight; if (R.domElement.width !== Math.round(w * R.getPixelRatio())) { R.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix(); }
    if (!ptr.size && t > idleAt) yaw += 0.0042 * 16; cam.position.z += (zoom - cam.position.z) * 0.18;
    if (obj) { obj.rotation.y = yaw / 1000 * 6; obj.position.y = Math.sin((t - t0) / 900) * 0.04; if (mir) { mir.rotation.y = obj.rotation.y; mir.position.y = -1.84 - obj.position.y; } } R.render(scene, cam); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  function bind(el) {
    if (el.dataset.vb) return; el.dataset.vb = "1"; el.style.touchAction = "none";
    el.addEventListener("pointerdown", (e) => { ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { el.setPointerCapture(e.pointerId); } catch { /* fine */ } if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = zoom; } });
    el.addEventListener("pointermove", (e) => { const p = ptr.get(e.pointerId); if (!p) return; if (ptr.size === 1) yaw += (e.clientX - p.x) * 1.6; p.x = e.clientX; p.y = e.clientY;
      if (ptr.size === 2 && pinch0) { const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y); zoom = Math.max(1.9, Math.min(5, zoom0 * pinch0 / Math.max(20, d))); } });
    const up = (e) => { ptr.delete(e.pointerId); if (ptr.size < 2) pinch0 = 0; idleAt = performance.now() + 2500; };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", (e) => { e.preventDefault(); zoom = Math.max(1.9, Math.min(5, zoom + Math.sign(e.deltaY) * 0.3)); idleAt = performance.now() + 2500; }, { passive: false });
  }
  async function show(el, P, ver) {
    if (!P || !THREE || !K) return; ensure(); host = el; el.appendChild(R.domElement); R.domElement.className = "my-3dc"; bind(el); zoom = 3.2;
    let src; try { src = await load(P.glb, ver); } catch { el.classList.add("off"); return; } if (host !== el) return;
    if (obj) scene.remove(obj); if (mir) scene.remove(mir);
    obj = new THREE.Group(); const o = src.clone(true), box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), k = 1.7 / Math.max(sz.x, sz.y, sz.z, 1e-3);
    o.position.copy(c).multiplyScalar(-k); o.scale.setScalar(k); obj.add(o); scene.add(obj);
    // its reflection in the floor: the same body upside down, faint (its own see-through materials)
    mir = new THREE.Group(); const m = o.clone(true); m.traverse((n) => { if (n.isMesh) { n.material = Array.isArray(n.material) ? n.material.map((x) => x.clone()) : n.material.clone(); for (const x of [].concat(n.material)) { x.transparent = true; x.opacity = 0.18; x.depthWrite = false; } } });
    mir.add(m); mir.scale.y = -1; scene.add(mir);
    t0 = performance.now(); el.classList.add("on"); if (!raf) raf = requestAnimationFrame(loop);
  }
  function dispose() { stop(); host = null; ptr.clear(); if (R) { R.dispose(); R.forceContextLoss(); R.domElement.remove(); R = null; } scene = null; obj = null; mir = null; }
  return { show, dispose };
}

export function makeMythicUI(ctx) {
  const { T, esc } = ctx; const viewer = makeViewer(ctx.THREE, ctx.K);
  let el = null, pick = "", tab = "set", mkt = null, sellId = "", top = null, mf = { slot: "", plus: 0, sort: "new", watch: false }, histId = "", oddsOpen = false, bidOpen = false;
  const statLine = (o) => Object.entries(o).filter(([k, v]) => v && STAT[k]).map(([k, v]) => `${T(STAT[k])} +${v}`).join(" · ");
  const watchSet = () => { try { return new Set(JSON.parse(localStorage.getItem("arc.world.myWatch") || "[]")); } catch { return new Set(); } };
  const setWatch = (s) => { try { localStorage.setItem("arc.world.myWatch", JSON.stringify([...s].slice(-60))); } catch { /* this visit only */ } };
  const snd = (k) => { try { if (ctx.Snd && ctx.Snd[k]) ctx.Snd[k](); } catch { /* no sound */ } };
  const st0 = () => ctx.state() || { pieces: [], eq: {}, ess: 0, shards: {} };
  const tNow = () => { const s = ctx.state(); return (s && s.now) || Date.now(); };
  function wornNow() { const st = st0(), lv = ctx.level(); return Object.values(st.eq || {}).map((id) => (st.pieces || []).find((p) => p.id === id)).filter((p) => p && p.req <= lv && pieceOf(p.def)); }
  const heldSlots = () => [...new Set((st0().pieces || []).map((p) => (pieceOf(p.def) || {}).slot).filter(Boolean))];
  // ---------------- the window ----------------
  function paint() {
    if (!el) return; const st = st0(), lv = ctx.level(), sb = setBonus(wornNow());
    const nShards = Object.entries(st.shards || {}).filter(([k, n]) => CC.SHARD[k] && n >= CC.SHARD[k]).length;
    el.innerHTML = `<div class="my-card"><header><div><small>MYTHIC · ${esc(T("SET"))}</small><h3>${esc(T("Crimson Celestial"))}</h3><p>${esc(T("{a} / 7 worn · {b} / 5 bonuses", { a: sb.n, b: sb.active.length }))}${sb.resonance ? " · ✦ " + esc(T("Crimson Resonance")) : ""} · 💠 ${esc(T("Crimson Essence {n}", { n: st.ess || 0 }))}</p></div><button type="button" class="my-x" aria-label="${esc(T("Close"))}">✕</button></header>
      <div class="my-tabs">${[["set", T("My set")], ["shard", T("Shards") + (nShards ? " •" : "")], ["mkt", T("Market")], ["top", T("Ranking")]].map(([k, l]) => `<button type="button" data-tab="${k}" class="${tab === k ? "on" : ""}">${esc(l)}</button>`).join("")}</div>
      ${tab === "mkt" ? marketHtml() : tab === "shard" ? shardHtml() : tab === "top" ? topHtml() : setHtml(st, lv, sb)}</div>`;
    mount3d(el);
  }
  function setHtml(st, lv, sb) {
    const pcs = st.pieces || [], eq = st.eq || {}, odds = slotOdds(heldSlots(), tNow()), bless = blessedSlot(tNow()), hero = (ctx.hero && ctx.hero()) || "aron";
    const slotBtn = (slot, i) => { const P = CC.PIECES.find((x) => x.slot === slot); if (!P) return ""; const mine = pcs.filter((p) => p.def === P.id && p.state !== "GAME_LISTED"), w = pcs.find((p) => p.id === eq[slot]);
      const a = (-90 + i * 360 / RING.length) * Math.PI / 180, x = 50 + 41 * Math.cos(a), y = 50 + 40 * Math.sin(a);
      return `<button type="button" class="my-slot${w ? " on" : ""}${mine.length ? (w ? "" : " held") : " none"}${pick === slot ? " sel" : ""}${slot === bless ? " bless" : ""}" data-slot="${slot}" style="--x:${x.toFixed(1)}%;--y:${y.toFixed(1)}%">
        <img src="${img(P, ctx.ver)}" alt="" onerror="this.style.visibility='hidden'">${w ? `<em class="pl">+${w.plus || 0}${w.stars ? " " + "★".repeat(w.stars) : ""}</em>` : ""}
        <b>${esc(T(P.name))}</b><i>${w ? "✓ " + esc(T("Worn")) : mine.length ? esc(T("{n} held", { n: mine.length })) : `${esc(T("Next drop"))} ${Math.round(odds[slot] * 100)}%`}</i></button>`; };
    // the track: 2 · 3 · 4 · 5 · 6 · ✦ (resonance), lit to what you wear, the next one named
    const nodes = [...CC.BONUS.map(([n, name, b]) => ({ n, name, b, on: sb.n >= n })), { n: 7, name: CC.RESONANCE.name, b: CC.RESONANCE.stats, on: sb.resonance, res: true }];
    const nxt = nodes.find((x) => !x.on), fill = Math.min(100, Math.max(0, ((sb.n - 1) / 6) * 100));
    const track = `<div class="my-track"><div class="my-track-bar"><i style="width:${(sb.resonance ? 100 : fill).toFixed(0)}%"></i>${nodes.map((x, i) => `<b class="${x.on ? "on" : ""}${x.res ? " res" : ""}" style="left:${(i / (nodes.length - 1) * 100).toFixed(1)}%">${x.res ? "✦" : x.n}</b>`).join("")}</div>
      <p>${nxt ? (nxt.res ? esc(T("Next: {b} — all seven worn at +{p} or more (yours: lowest +{l})", { b: T(nxt.name), p: CC.RESONANCE.plus, l: sb.lowPlus || 0 })) : esc(T("Next: {b} at {n} pieces — {k} more", { b: T(nxt.name), n: nxt.n, k: nxt.n - sb.n })) + ` <small>${esc(statLine(nxt.b))}${nxt.b.aura ? " · " + esc(T("Crimson aura")) : ""}</small>`) : esc(T("Every bonus is yours — the Crimson Resonance too."))}</p>
      <div class="my-bon">${nodes.map((x) => `<div class="${x.on ? "on" : ""}"><i>${x.res ? "✦" : x.n}</i><span><b>${esc(T(x.name))}</b><small>${esc(statLine(x.b))}${x.b.aura ? " · " + esc(T("Crimson aura")) : ""}${x.res ? " · " + esc(T("all seven at +{p}", { p: CC.RESONANCE.plus })) : ""}</small></span></div>`).join("")}</div></div>`;
    const wk = (weekNo(tNow()) + 1) * 7 - 3, left = Math.max(0, wk * 864e5 - 9 * 3600e3 - tNow()), d = Math.floor(left / 864e5), h = Math.floor((left % 864e5) / 3600e3);
    const PB = CC.PIECES.find((x) => x.slot === bless);
    return `<div class="my-body"><div class="my-stage"><img class="my-hero" src="/images/ui/menu2/stand-${hero}.webp${ctx.ver || ""}" alt="" onerror="this.remove()"><div class="my-rune"></div>${RING.map(slotBtn).join("")}</div>
      <div class="my-blessing">🌙 <b>${esc(T("This week's blessing"))}</b> ${esc(T(PB ? PB.name : ""))} — ${esc(T("drops twice as often"))} <small>${esc(T("changes in {d}d {h}h", { d, h }))}</small></div>
      ${track}
      <div class="my-drop"><h4>${esc(T("Where it drops"))}</h4>${Object.entries(CC.DROP).map(([k, dd]) => `<span><b>${esc(T(SRC[k]))}</b>${+(dd.rate * 100).toFixed(2)}% · ${esc(T("worn from Lv {n}", { n: dd.req }))} · ×${dd.mult}</span>`).join("")}
      <p>${esc(T("A won run drops a piece at its dungeon's chance. Slots you don't hold yet come up three times as often, and this week's blessed slot twice as often. Every won run also adds a Crimson Shard."))}</p></div></div>
      ${pick ? sheetHtml(st, lv) : ""}`;
  }
  // the picked slot's sheet: the piece in 3D, the comparison, each copy you hold with its buttons and its story
  function sheetHtml(st, lv) {
    const P0 = CC.PIECES.find((p) => p.slot === pick); if (!P0) return ""; const pcs = st.pieces || [], eq = st.eq || {}, list = pcs.filter((p) => p.def === P0.id);
    const cur = pcs.find((p) => p.id === eq[pick]), regular = ctx.eqItem ? ctx.eqItem(pick) : null, nowStats = cur ? mythicStats(cur) : regular ? itemStats(regular) : {};
    const compare = (p) => { if (cur && cur.id === p.id) return ""; const s = mythicStats(p), keys = [...new Set([...Object.keys(s), ...Object.keys(nowStats)])].filter((k) => STAT[k]);
      return `<div class="my-cmp"><small>${esc(T("vs what you wear now"))}</small>${keys.map((k) => { const dlt = Math.round(((s[k] || 0) - (nowStats[k] || 0)) * 10) / 10; return dlt ? `<span class="${dlt > 0 ? "up" : "dn"}">${esc(T(STAT[k]))} ${dlt > 0 ? "▲" : "▼"}${Math.abs(dlt)}</span>` : ""; }).join("")}</div>`; };
    const row = (p) => { const on = eq[P0.slot] === p.id, low = p.req > lv, listed = p.state === "GAME_LISTED", c = enhCost(p.plus || 0, p.fails || 0), top = (p.plus || 0) >= CC.MAX_PLUS;
      const dups = list.filter((x) => x.id !== p.id && x.state !== "GAME_LISTED" && eq[P0.slot] !== x.id), stars = p.stars || 0;
      return `<div class="my-pc${on ? " on" : ""}${listed ? " listed" : ""}" data-pc="${p.id}"><span><b>${esc(T(SRC[p.src] || p.src))} · +${p.plus || 0}${stars ? ` <i class="my-star">${"★".repeat(stars)}</i>` : ""}</b><small>${esc(T("Worn from Lv {n}", { n: p.req }))} · ×${p.mult}${listed ? ` · 🏷 ${fmtN(p.price)} ARCL` : ""}</small><em>${esc(statLine(mythicStats(p)))}</em>${compare(p)}</span>
        <div class="my-acts">${listed ? `<button type="button" data-unlist="${p.id}">${esc(T("Take back"))}</button>` : `<button type="button" class="go" data-eq="${p.id}" ${low && !on ? "disabled" : ""}>${on ? esc(T("Take off")) : low ? "🔒 Lv " + p.req : esc(T("Wear"))}</button>
          <button type="button" class="enh" data-enh="${p.id}" ${top ? "disabled" : ""}>${top ? "+" + CC.MAX_PLUS : `⬆ +${(p.plus || 0) + 1} · ${c.ess}💠 ${fmtN(c.arcl)} ARCL · ${Math.round(c.rate * 100)}%${c.up ? ` <small>(+${Math.round(c.up * 100)}%)</small>` : ""}`}</button>
          ${stars < CC.MAX_STARS && dups.length ? `<button type="button" class="awk" data-awk="${p.id}" data-fod="${dups[0].id}">★ ${esc(T("Awaken with a copy"))} → ${"★".repeat(stars + 1)}</button>` : ""}
          <select data-rfs="${p.id}" aria-label="${esc(T("Reforge into"))}"><option value="">♻ ${esc(T("Reforge into…"))} (${reforgeCost(p)}💠)</option>${CC.PIECES.filter((x) => x.id !== p.def).map((x) => `<option value="${x.slot}">${esc(T(x.name))}</option>`).join("")}</select>
          <button type="button" data-sell="${p.id}">🏷 ${esc(T("Sell"))}</button><button type="button" class="salv" data-salv="${p.id}">♻ ${esc(T("Salvage"))} +${essOf(p)}💠</button>
          <button type="button" class="hist" data-hist="${p.id}">📜 ${esc(T("Its story"))}</button>`}</div>
        ${histId === p.id ? storyHtml(p) : ""}
        ${sellId === p.id ? `<form class="my-sellf" data-sellf="${p.id}"><input type="number" min="${CC.MARKET.MIN}" max="${CC.MARKET.MAX}" step="100" value="${CC.MARKET.MIN * 10}" aria-label="${esc(T("Price in ARCL"))}"><button type="submit">${esc(T("List for sale"))}</button><small>${esc(T("2% goes to the platform when it sells."))}</small></form>` : ""}</div>`; };
    const nextStar = (CC.AWAKEN[P0.slot] || []).map((o, i) => `<span>${"★".repeat(i + 1)} ${esc(statLine(o))}</span>`).join("");
    const oddsTbl = `<div class="my-odds${oddsOpen ? " on" : ""}"><button type="button" data-odds>${esc(T("Enhance odds"))} ${oddsOpen ? "▲" : "▼"}</button>${oddsOpen ? `<div>${Array.from({ length: CC.MAX_PLUS }, (_, n) => { const c = enhCost(n); return `<span><b>+${n} → +${n + 1}</b>${Math.round(c.rate * 100)}% · ${c.ess}💠 · ${fmtN(c.arcl)}</span>`; }).join("")}<p>${esc(T("A miss keeps the piece and its +. Each miss in a row adds {u}% to the next try, up to {m}%.", { u: Math.round(CC.ENH.FAIL_UP * 100), m: Math.round(CC.ENH.FAIL_MAX * 100) }))}</p></div>` : ""}</div>`;
    return `<div class="my-sheet" role="region" aria-label="${esc(T(P0.name))}"><button type="button" class="my-sheet-x" data-unpick aria-label="${esc(T("Close"))}">⌄</button>
      <div class="my-sheet-top"><div class="my-3d" data-3d="${P0.id}"><img src="${img(P0, ctx.ver)}" alt="" onerror="this.style.visibility='hidden'"><small class="my-3dh">${esc(T("Drag to turn · pinch to zoom"))}</small></div>
      <div><h4>${esc(T(P0.name))}</h4><p class="my-line">${esc(T(SLOT_NAME[P0.slot]))} · ${esc(T(P0.line))}</p><div class="my-awk-l"><small>${esc(T("Awakening"))}</small>${nextStar}</div></div></div>
      ${list.length ? list.map(row).join("") : `<p class="my-empty">${esc(T("Not found yet. It drops from RAID QUEENS runs — or make it from Crimson Shards."))}</p>`}${oddsTbl}</div>`;
  }
  function storyHtml(p) {
    const K = { drop: "Dropped in {v}", claim: "Made from {v} shards", plus: "Enhanced to +{v}", star: "Awakened ★{v}", reforge: "Reforged into {v}", sold: "Changed hands for {v} ARCL" };
    const short = (w) => (w ? String(w).slice(0, 6) + "…" + String(w).slice(-4) : "—"), when = (t) => new Date(t).toLocaleDateString();
    const lines = (p.log && p.log.length ? p.log : [{ k: "drop", at: p.at, v: p.src }]).map((x) => { const v = x.k === "drop" || x.k === "claim" ? T(SRC[x.v] || x.v || "") : x.k === "reforge" ? T((pieceOf(x.v) || {}).name || x.v) : x.k === "sold" ? fmtN(x.v) : x.v; return `<li><time>${esc(when(x.at))}</time>${esc(T(K[x.k] || x.k, { v }))}</li>`; });
    return `<div class="my-story"><p>${esc(T("First owner {w}", { w: short(p.first || ((p.hist || [])[0] || {}).from || p.owner) }))} · ${esc(T("{n} owners", { n: 1 + (p.hist || []).length }))}</p><ol>${lines.join("")}</ol></div>`;
  }
  // ---------------- Crimson Shards ----------------
  function shardHtml() {
    const st = st0(), sh = st.shards || {}, odds = slotOdds(heldSlots(), tNow());
    return `<div class="my-body"><p class="my-fine">${esc(T("Every won run adds one shard of its dungeon. When a dungeon's shards are full, pick the slot you want: the piece comes from that dungeon (its level to wear and multiplier)."))}</p>
      ${Object.entries(CC.SHARD).map(([k, need]) => { const have = sh[k] || 0, full = have >= need; return `<div class="my-shard${full ? " full" : ""}"><div><b>${esc(T(SRC[k]))}</b><small>${have} / ${need}</small><i class="my-sbar"><i style="width:${Math.min(100, have / need * 100).toFixed(0)}%"></i></i></div>
        ${full ? `<div class="my-shard-pick">${CC.PIECES.map((P) => `<button type="button" data-claim="${k}:${P.slot}"><img src="${img(P, ctx.ver)}" alt="" onerror="this.style.visibility='hidden'"><span>${esc(T(P.name))}</span></button>`).join("")}</div>` : `<small class="my-shard-left">${esc(T("{n} more wins", { n: need - have }))}</small>`}</div>`; }).join("")}
      <div class="my-drop"><h4>${esc(T("Next drop's slot"))}</h4>${CC.PIECES.map((P) => `<span><b>${esc(T(P.name))}</b>${Math.round(odds[P.slot] * 100)}%</span>`).join("")}</div></div>`;
  }
  // ---------------- the market ----------------
  function marketHtml() {
    if (!mkt) { loadMarket(); return `<div class="my-body"><p class="my-empty">…</p></div>`; }
    const me = ((ctx.sess && ctx.sess()) || {}).wallet || "", mine = (s) => me && s && me.toLowerCase().startsWith(s.slice(0, 6).toLowerCase()) && me.toLowerCase().endsWith(s.slice(-4).toLowerCase());
    const watch = watchSet(), st = st0();
    let items = (mkt.items || []).filter((x) => { const P = pieceOf(x.def); return P && (!mf.slot || P.slot === mf.slot) && (x.plus || 0) >= mf.plus && (!mf.watch || watch.has(x.id)); });
    items = items.sort((a, b) => (mf.sort === "low" ? a.price - b.price : mf.sort === "high" ? b.price - a.price : mf.sort === "plus" ? (b.plus || 0) - (a.plus || 0) : b.at - a.at));
    // the price line: recent sales of the filtered slot (or all), oldest to newest
    const sales = (mkt.sales || []).filter((s) => !mf.slot || (pieceOf(s.def) || {}).slot === mf.slot).slice(-30);
    let line = ""; if (sales.length >= 2) { const max = Math.max(...sales.map((s) => s.price)), min = Math.min(...sales.map((s) => s.price)), W = 300, H = 70, pts = sales.map((s, i) => `${(i / (sales.length - 1) * W).toFixed(1)},${(H - 6 - (max === min ? 0.5 : (s.price - min) / (max - min)) * (H - 12)).toFixed(1)}`).join(" ");
      line = `<div class="my-line-c"><small>${esc(T("Recent sales"))} · ${sales.length} · ${fmtN(min)}–${fmtN(max)} ARCL</small><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#ff7a9c" stroke-width="2"/></svg><b>${esc(T("Last {p} ARCL", { p: fmtN(sales[sales.length - 1].price) }))}</b></div>`; }
    else line = `<p class="my-fine">${esc(T("No sales yet — the price line starts with the first."))}</p>`;
    const filters = `<div class="my-mf"><select data-mf="slot"><option value="">${esc(T("All pieces"))}</option>${CC.PIECES.map((P) => `<option value="${P.slot}" ${mf.slot === P.slot ? "selected" : ""}>${esc(T(P.name))}</option>`).join("")}</select>
      <select data-mf="plus">${[0, 5, 10, 15].map((n) => `<option value="${n}" ${mf.plus === n ? "selected" : ""}>${n ? "+" + n + "↑" : esc(T("Any +"))}</option>`).join("")}</select>
      <select data-mf="sort">${[["new", T("Newest")], ["low", T("Price ↑")], ["high", T("Price ↓")], ["plus", T("Highest +")]].map(([k, l]) => `<option value="${k}" ${mf.sort === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
      <button type="button" data-mfw class="${mf.watch ? "on" : ""}">★ ${esc(T("Watched"))}</button></div>`;
    const list = items.length ? items.map((x) => { const P = pieceOf(x.def); return `<div class="my-li"><img src="${img(P, ctx.ver)}" alt="" onerror="this.style.visibility='hidden'"><span><b>${esc(T(P.name))} +${x.plus || 0}${x.stars ? " " + "★".repeat(x.stars) : ""}</b><small>${esc(T(SRC[x.src] || x.src))} · ${esc(T("Worn from Lv {n}", { n: x.req }))} · ×${x.mult}</small><em>${esc(statLine(mythicStats(x)))}</em><small>${esc(T("Seller {w}", { w: x.seller }))}</small></span>
      <div class="my-li-b"><button type="button" class="star${watch.has(x.id) ? " on" : ""}" data-watch="${x.id}" aria-label="${esc(T("Watch"))}">★</button><button type="button" class="go" data-buy="${x.id}" ${mine(x.seller) ? "disabled" : ""}>${fmtN(x.price)} ARCL</button></div></div>`; }).join("") : `<p class="my-empty">${esc(mf.watch ? T("Nothing you watch is for sale.") : T("Nothing for sale right now."))}</p>`;
    // buy requests: anyone's, the ones you can fill (a matching piece of yours), your own (take back), a new one
    const bids = (mkt.bids || []).filter((x) => !mf.slot || (pieceOf(x.def) || {}).slot === mf.slot);
    const fitOf = (b) => (st.pieces || []).filter((p) => p.def === b.def && (p.plus || 0) >= b.minPlus && p.state !== "GAME_LISTED").sort((a, c) => (a.plus || 0) - (c.plus || 0))[0];
    const bidRows = bids.length ? bids.map((b) => { const P = pieceOf(b.def), f = fitOf(b), my = mine(b.w); return P ? `<div class="my-bid"><span><b>${esc(T(P.name))} ${b.minPlus ? "+" + b.minPlus + "↑" : ""}</b><small>${esc(T("Wanted by {w}", { w: b.w }))}</small></span><b class="pr">${fmtN(b.price)} ARCL</b>
      ${my ? `<button type="button" data-unbid="${b.bid}">${esc(T("Take back"))}</button>` : f ? `<button type="button" class="go" data-fill="${b.bid}" data-fid="${f.id}">${esc(T("Sell mine (+{n})", { n: f.plus || 0 }))}</button>` : ""}</div>` : ""; }).join("") : `<p class="my-fine">${esc(T("No buy requests yet."))}</p>`;
    const bidForm = bidOpen ? `<form class="my-bidf" data-bidf><select name="def">${CC.PIECES.map((P) => `<option value="${P.id}">${esc(T(P.name))}</option>`).join("")}</select><select name="plus">${[0, 5, 10, 15].map((n) => `<option value="${n}">${n ? "+" + n + "↑" : esc(T("Any +"))}</option>`).join("")}</select><input name="price" type="number" min="${CC.MARKET.MIN}" max="${CC.MARKET.MAX}" step="100" value="${CC.MARKET.MIN * 10}" aria-label="${esc(T("Price in ARCL"))}"><button type="submit" class="go">${esc(T("Post the request"))}</button><small>${esc(T("The ARCL is held until someone sells you one, or you take it back."))}</small></form>` : `<button type="button" class="my-newbid" data-bidopen>＋ ${esc(T("Ask to buy a piece"))}</button>`;
    return `<div class="my-body">${filters}${line}<div class="my-mkt">${list}</div>
      <h4 class="my-h">${esc(T("Buy requests"))}</h4><div class="my-bids">${bidRows}</div>${bidForm}
      <p class="my-fine">${esc(T("Pieces change hands with their +, stars, story and where they came from. 2% of the price goes to the platform."))}</p></div>`;
  }
  async function loadMarket() { try { const r = await fetch("/api/social?world=mythic-market", { cache: "no-store" }); mkt = r.ok ? await r.json() : { items: [] }; } catch { mkt = { items: [] }; } paint(); }
  // ---------------- the boards ----------------
  function topHtml() {
    if (!top) { fetch("/api/social?world=mythic-top", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { top = j || { collect: [], plus: [] }; paint(); }).catch(() => { top = { collect: [], plus: [] }; paint(); }); return `<div class="my-body"><p class="my-empty">…</p></div>`; }
    const rows = (L, v) => (L && L.length ? `<ol class="my-top">${L.map((u, i) => `<li><i>${i + 1}</i><b>${esc(u.name || u.w)}</b><span>${v(u)}</span></li>`).join("")}</ol>` : `<p class="my-fine">${esc(T("Be the first!"))}</p>`);
    return `<div class="my-body my-tops"><section><h4 class="my-h">${esc(T("Collectors"))}</h4>${rows(top.collect, (u) => `${u.n} / 7${u.stars ? " · ★" + u.stars : ""}`)}</section><section><h4 class="my-h">${esc(T("Highest +"))}</h4>${rows(top.plus, (u) => `+${u.best}`)}</section></div>`;
  }
  // ---------------- doing things ----------------
  async function act(action, extra, okMsg) {
    const r = await ctx.post({ action, ...ctx.sess(), ...extra });
    if (!r || !r.ok) { ctx.toast(esc((r && r.j && r.j.error) ? T(r.j.error) : T("Couldn't change it — try again"))); snd("bad"); return null; }
    const before = setBonus(wornNow()); await ctx.refresh(); if (ctx.purse) ctx.purse(); if (okMsg) ctx.toast(okMsg(r.j)); paint(); afterBonus(before); return r.j;
  }
  function mount3d(root) { const b = root && root.querySelector("[data-3d]"); if (b) viewer.show(b, pieceOf(b.dataset["3d"]), ctx.ver); }
  /// a set bonus reached (or the resonance) after a change: its cut-in, and a share card for the big ones
  function afterBonus(before) {
    const now = setBonus(wornNow()); if (now.active.length > before.active.length) { const [n, name] = now.active[now.active.length - 1]; cutIn(n >= 6 ? "big" : "set", n, T(name)); if (n >= 6) offerShare("set6"); }
    if (now.resonance && !before.resonance) { cutIn("big", "✦", T(CC.RESONANCE.name)); offerShare("res"); }
  }
  async function wear(id) {
    const st = st0(), p = (st.pieces || []).find((x) => x.id === id), P = p && pieceOf(p.def); if (!P) return;
    const on = (st.eq || {})[P.slot] === id, before = setBonus(wornNow()), r = await ctx.post({ action: "world-mythic-equip", ...ctx.sess(), slot: P.slot, id: on ? null : id });
    if (!r || !r.ok) { ctx.toast(esc((r && r.j && r.j.error) ? T(r.j.error) : T("Couldn't change it — try again"))); snd("bad"); return; }
    await ctx.refresh(); paint(); snd("equip"); if (!on) flashSlot(P.slot); afterBonus(before);
  }
  /// wearing one: a crimson flare round its slot
  function flashSlot(slot) { const b = el && el.querySelector(`.my-slot[data-slot="${slot}"]`); if (!b || ctx.reduce) return; const f = document.createElement("i"); f.className = "my-flare"; b.appendChild(f); setTimeout(() => f.remove(), 1200); }
  /// a set bonus's cut-in: a band of light, its number and name (the sixth and the resonance: wings and a bigger burst)
  function cutIn(kind, n, name) {
    if (typeof document === "undefined") return; const c = document.createElement("div"); c.className = "my-cut " + kind; c.setAttribute("role", "status");
    c.innerHTML = `<div><small>${esc(T("SET BONUS"))}</small><b>${esc(String(n))}</b><strong>${esc(name)}</strong></div>`; document.body.appendChild(c); snd(kind === "big" ? "level" : "perfect");
    setTimeout(() => c.classList.add("out"), kind === "big" ? 2300 : 1500); setTimeout(() => c.remove(), kind === "big" ? 2800 : 2000);
  }
  /// the forge's moment: three strikes, then a burst and the + flying in — or a crack that mends (the + stays)
  async function hammer(btn, id) {
    const box = document.createElement("div"); box.className = "my-forge"; box.innerHTML = `<div class="my-forge-in"><i class="hm">🔨</i><b class="pl"></b><i class="cr"></i><i class="bu"></i></div>`; document.body.appendChild(box);
    const strikes = ctx.reduce ? 0 : 3; for (let i = 0; i < strikes; i++) { box.classList.remove("hit"); void box.offsetWidth; box.classList.add("hit"); snd("chink"); await new Promise((ok) => setTimeout(ok, 300)); }
    const before = setBonus(wornNow()), r = await ctx.post({ action: "world-mythic-enhance", ...ctx.sess(), id });
    if (!r || !r.ok) { box.remove(); ctx.toast(esc((r && r.j && r.j.error) ? T(r.j.error) : T("Couldn't change it — try again"))); snd("bad"); if (btn) btn.disabled = false; return; }
    const j = r.j; box.classList.add(j.hit ? "ok" : "miss"); box.querySelector(".pl").textContent = j.hit ? `+${j.plus}` : T("Still +{n}", { n: j.plus });
    snd(j.hit ? "perfect" : "crumble"); await new Promise((ok) => setTimeout(ok, j.hit ? 1100 : 1300)); box.classList.add("out"); setTimeout(() => box.remove(), 350);
    await ctx.refresh(); if (ctx.purse) ctx.purse(); paint(); afterBonus(before);
    if (j.hit && (j.plus === 10 || j.plus === 15)) { cutIn("big", "+" + j.plus, T(pieceOf(((st0().pieces || []).find((p) => p.id === id) || {}).def || "")?.name || "")); offerShare("plus", id); }
    else ctx.toast(esc(j.hit ? T("Success! Now +{n}", { n: j.plus }) : T("It didn't take — still +{n}. Next try {r}%", { n: j.plus, r: Math.round((j.next || 0) * 100) })));
  }
  /// a share card for the big moments (six worn, the resonance, +10 / +15)
  function offerShare(kind, id) {
    if (!ctx.share) return; const st = st0(), sb = setBonus(wornNow()), p = id && (st.pieces || []).find((x) => x.id === id), P = p && pieceOf(p.def);
    const card = kind === "plus" && P ? { kind: "mythic", tag: "MYTHIC · " + T("Crimson Celestial"), title: `${T(P.name)} +${p.plus}`, sub: T(SRC[p.src] || p.src), badge: "+" + p.plus, art: img(P, ctx.ver), accent: "#ff3d6e", rows: [[T("Stars"), "★".repeat(p.stars || 0) || "—", "⭐"], [T("Stats"), statLine(mythicStats(p)).slice(0, 60), "⚔️"]], text: T("My {n} just hit +{p} in ARCIRCLE WORLD.", { n: T(P.name), p: p.plus }) }
      : { kind: "mythic", tag: "MYTHIC · " + T("Crimson Celestial"), title: kind === "res" ? T(CC.RESONANCE.name) : T("Crimson Ascension"), sub: T("{a} / 7 worn · {b} / 5 bonuses", { a: sb.n, b: sb.active.length }), badge: kind === "res" ? "✦" : String(sb.n), art: img(CC.PIECES[0], ctx.ver), accent: "#ff3d6e", rows: CC.BONUS.filter(([n]) => sb.n >= n).slice(-3).map(([n, name]) => [String(n), T(name), "✦"]), text: T("The Crimson Celestial set, assembled in ARCIRCLE WORLD.") };
    setTimeout(() => { const t = document.createElement("div"); t.className = "my-shareask"; t.innerHTML = `<span>${esc(T("Show it off?"))}</span><button type="button" class="go">${esc(T("Share card"))}</button><button type="button" class="x" aria-label="${esc(T("Close"))}">✕</button>`; document.body.appendChild(t);
      t.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; t.remove(); if (b.classList.contains("go")) ctx.share(card); }); setTimeout(() => t.remove(), 12000); }, 1800);
  }
  /// the drop card's Wear now: the new piece may not be in the set we hold yet, so fetch it first
  async function wearNow(id) { try { await ctx.refresh(); } catch { /* try with what we have */ } const st = st0(); if (!(st.pieces || []).some((x) => x.id === id)) { ctx.toast(esc(T("Couldn't change it — try again"))); return; }
    await wear(id); const eq = (ctx.state() || {}).eq || {}; if (Object.values(eq).includes(id)) ctx.toast(esc(T("Worn — the set's bonuses count it now"))); }
  function open(slot, tab0) {
    if (typeof document === "undefined" || el) return; pick = slot || ""; tab = tab0 || "set"; histId = ""; sellId = "";
    el = document.createElement("div"); el.className = "my-win"; el.setAttribute("role", "dialog"); el.setAttribute("data-no-i18n", ""); document.body.appendChild(el); ctx.freeze(true);
    el.addEventListener("submit", async (e) => { const f = e.target.closest("[data-sellf]"), bf = e.target.closest("[data-bidf]"); if (!f && !bf) return; e.preventDefault();
      if (f) { const price = Math.floor(Number(f.querySelector("input").value) || 0); sellId = ""; await act("world-mythic-list", { id: f.dataset.sellf, price }, () => esc(T("Listed for {p} ARCL", { p: fmtN(price) }))); mkt = null; return; }
      const fd = new FormData(bf), price = Math.floor(Number(fd.get("price")) || 0); if (typeof confirm === "function" && !confirm(T("Hold {p} ARCL for this request?", { p: fmtN(price) }))) return;
      bidOpen = false; await act("world-mythic-bid", { def: fd.get("def"), minPlus: Number(fd.get("plus")) || 0, price }, () => esc(T("Request posted — the ARCL is held"))); mkt = null; paint(); });
    el.addEventListener("change", async (e) => { const s = e.target.closest("[data-mf]"); if (s) { const k = s.dataset.mf; mf[k] = k === "plus" ? Number(s.value) || 0 : s.value; paint(); return; }
      const rf = e.target.closest("[data-rfs]"); if (rf && rf.value) { const P = CC.PIECES.find((x) => x.slot === rf.value); if (typeof confirm === "function" && !confirm(T("Reforge it into {n}? Its + and stars go back to 0.", { n: T(P ? P.name : "") }))) { rf.value = ""; return; }
        const j = await act("world-mythic-reforge", { id: rf.dataset.rfs, slot: rf.value }, () => esc(T("Reforged into {n}", { n: T(P ? P.name : "") }))); if (j) { pick = rf.value; snd("salvage"); paint(); } } });
    el.addEventListener("click", async (e) => { const s = e.target.closest("[data-slot]"), q = e.target.closest("[data-eq]"), tb = e.target.closest("[data-tab]");
      if (tb) { tab = tb.dataset.tab; if (tab === "mkt") mkt = null; if (tab === "top") top = null; pick = ""; snd("tab"); paint(); return; }
      if (e.target.closest("[data-unpick]")) { pick = ""; paint(); return; }
      if (e.target.closest("[data-odds]")) { oddsOpen = !oddsOpen; paint(); return; }
      if (e.target.closest("[data-bidopen]")) { bidOpen = true; paint(); return; }
      if (e.target.closest("[data-mfw]")) { mf.watch = !mf.watch; paint(); return; }
      const wa = e.target.closest("[data-watch]"); if (wa) { const s0 = watchSet(); s0.has(wa.dataset.watch) ? s0.delete(wa.dataset.watch) : s0.add(wa.dataset.watch); setWatch(s0); paint(); return; }
      const hi = e.target.closest("[data-hist]"); if (hi) { histId = histId === hi.dataset.hist ? "" : hi.dataset.hist; paint(); return; }
      const en = e.target.closest("[data-enh]"); if (en && !en.disabled) { en.disabled = true; await hammer(en, en.dataset.enh); return; }
      const aw = e.target.closest("[data-awk]"); if (aw) { if (typeof confirm === "function" && !confirm(T("Give up a copy to awaken this piece? The copy is gone for good."))) return; const j = await act("world-mythic-awaken", { id: aw.dataset.awk, fodder: aw.dataset.fod }, (x) => esc(T("Awakened! ★{n}", { n: x.piece.stars }))); if (j) { snd("level"); cutIn("set", "★" + j.piece.stars, T(pieceOf(j.piece.def).name)); } return; }
      const cl = e.target.closest("[data-claim]"); if (cl) { const [src, slot] = cl.dataset.claim.split(":"), P = CC.PIECES.find((x) => x.slot === slot); if (typeof confirm === "function" && !confirm(T("Make {n} from {d} shards?", { n: T(P.name), d: T(SRC[src]) }))) return;
        const j = await act("world-mythic-claim", { src, slot }); if (j && j.piece) { tab = "set"; reveal(j.piece, true); } return; }
      const sv = e.target.closest("[data-salv]"); if (sv) { if (typeof confirm === "function" && !confirm(T("Salvage this piece into Crimson Essence? It's gone for good."))) return; await act("world-mythic-salvage", { id: sv.dataset.salv }, (j) => esc(T("+{n} Crimson Essence", { n: j.gain }))); snd("salvage"); return; }
      const se = e.target.closest("[data-sell]"); if (se) { sellId = sellId === se.dataset.sell ? "" : se.dataset.sell; paint(); return; }
      const ul = e.target.closest("[data-unlist]"); if (ul) { await act("world-mythic-unlist", { id: ul.dataset.unlist }, () => esc(T("Taken back"))); mkt = null; return; }
      const ub = e.target.closest("[data-unbid]"); if (ub) { await act("world-mythic-unbid", { bid: ub.dataset.unbid }, () => esc(T("Taken back — the ARCL is yours again"))); mkt = null; paint(); return; }
      const fl = e.target.closest("[data-fill]"); if (fl) { if (typeof confirm === "function" && !confirm(T("Sell your piece to this request?"))) return; await act("world-mythic-fill", { bid: fl.dataset.fill, id: fl.dataset.fid }, (j) => esc(T("Sold for {p} ARCL", { p: fmtN(j.price) }))); snd("coin"); mkt = null; paint(); return; }
      const by = e.target.closest("[data-buy]"); if (by && !by.disabled) { if (typeof confirm === "function" && !confirm(T("Buy it for {p} ARCL?", { p: by.textContent }))) return; by.disabled = true; await act("world-mythic-buy", { id: by.dataset.buy }, () => esc(T("It's yours — in your set now"))); snd("buy"); mkt = null; tab = "set"; paint(); return; }
      if (e.target.closest(".my-sellf,.my-bidf,select")) return;
      if (q && !q.disabled) { wear(q.dataset.eq); return; }
      if (s) { const sl = s.dataset.slot; pick = pick === sl ? "" : sl; histId = ""; snd("tap"); paint(); return; }
      if (e.target === el || e.target.closest(".my-x")) close(); });
    paint(); ctx.refresh().then(paint);
  }
  function close() { if (el) { el.remove(); el = null; ctx.freeze(false); viewer.dispose(); } }
  /// the drop's moment: the screen dims, a beam of crimson light comes down, the piece falls into it and settles, its name
  /// is cut into the card letter by letter; NEW for a slot you didn't hold, and the bonus it would open if you wore it
  function reveal(p, made) {
    const P = pieceOf(p && p.def); if (!P || typeof document === "undefined") return;
    const st = st0(), isNew = !(st.pieces || []).some((x) => x.id !== p.id && (pieceOf(x.def) || {}).slot === P.slot);
    const worn = wornNow().filter((x) => (pieceOf(x.def) || {}).slot !== P.slot), after = setBonus([...worn, p]), before = setBonus(wornNow());
    const opens = ctx.level() >= p.req && after.active.length > before.active.length ? after.active[after.active.length - 1] : null;
    const r = document.createElement("div"); r.className = "my-rev" + (ctx.reduce ? " calm" : ""); r.setAttribute("role", "dialog"); r.setAttribute("data-no-i18n", "");
    const name = T(P.name), letters = [...name].map((ch, i) => `<span style="--i:${i}">${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("");
    r.innerHTML = `<i class="my-rev-beam"></i><div class="my-rev-in"><small>MYTHIC · ${esc(T("Crimson Celestial"))}${made ? " · " + esc(T("made from shards")) : ""}</small>${isNew ? `<em class="my-new">NEW</em>` : ""}<div class="my-rev-art my-3d" data-3d="${P.id}"><img src="${img(P, ctx.ver)}" alt="" onerror="this.style.visibility='hidden'"></div><b class="my-rev-name">${letters}</b><p>${esc(T(SRC[p.src] || p.src))} · ${esc(T("Worn from Lv {n}", { n: p.req }))} · ×${p.mult}</p><em>${esc(statLine(mythicStats(p)))}</em>
      ${opens ? `<p class="my-rev-opens">✦ ${esc(T("Wear it to open {b}", { b: T(opens[1]) }))}</p>` : ""}
      <div class="my-rev-acts"><button type="button" data-k="ok">${esc(T("OK"))}</button><button type="button" class="go" data-k="set">${esc(T("Open the set"))}</button>${p.id && ctx.level() >= p.req ? `<button type="button" class="go" data-k="wear">${esc(T("Wear now"))}</button>` : ""}</div></div>`;
    document.body.appendChild(r); setTimeout(() => mount3d(r), ctx.reduce ? 0 : 900);
    r.addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; r.remove(); viewer.dispose(); if (b.dataset.k === "set") { close(); open(P.slot); } if (b.dataset.k === "wear") wearNow(p.id); if (el) { ctx.refresh().then(paint); } });
    snd("chest"); setTimeout(() => snd("perfect"), 900);
  }
  return { open, close, reveal, shown: () => !!el };
}
