// world-village.js — your island as a village (api/_world-village.mjs keeps the numbers):
//   makeCentre(THREE, K, level)   the village centre at the middle of your island: a cottage at level 1, a bell tower,
//                                 a town hall, a castle, then a palace with the ARCIRCLE rings — it grows with the level
//   createVillage(ctx)            the Village window: level, XP to the next one, what the score is made of, the
//                                 blessing, the upgrade from level 5 (paid in $ARCIRCLE), and the weekly contest
//                                 (enter it; the GM wallet picks the winners and their ARCL)
// ctx: { T, esc, toast, post, sess, Snd, pay(id, target, onStatus), goVillage(), freeze(on), onVillage(v) }
export const GM_WALLETS = ["0x1250fe3b1de11da51457bca3fc8840f4ab4aeac1"];
export const isGM = (w) => GM_WALLETS.includes(String(w || "").toLowerCase());
export const GM_COLOR = "#ffc861";
const TIERS = [[1, "Cottage"], [3, "Bell tower"], [5, "Town hall"], [8, "Castle"], [12, "Palace"]];
export const centreTier = (L) => TIERS.reduce((t, [lv], i) => (L >= lv ? i : t), 0);
export const centreName = (L) => TIERS[centreTier(L)][1];

export function makeCentre(THREE, K, level = 1) {
  const g = new THREE.Group(); g.name = "village-centre";
  const tier = centreTier(level), spin = [];
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o });
  const stone = std(0xd9dde3, { roughness: 0.8 }), wall = std(0xf3efe6), roof = std(tier >= 3 ? 0x2f86ff : 0x3d9b6a, { roughness: 0.5 }), wood = std(0x8a5a36, { roughness: 0.85 });
  const gold = std(0xffc861, { metalness: 0.85, roughness: 0.25, emissive: 0x5a3c0a, emissiveIntensity: 0.25 }), glass = std(0x9fd8ff, { emissive: 0x2a6aa0, emissiveIntensity: 0.6, roughness: 0.2 });
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const cyl = (r1, r2, h, m, x = 0, y = 0, z = 0, seg = 16) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.position.set(x, y + h / 2, z); o.castShadow = true; g.add(o); return o; };
  const cone = (r, h, m, x = 0, y = 0, z = 0, seg = 4) => { const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m); o.position.set(x, y + h / 2, z); if (seg === 4) o.rotation.y = Math.PI / 4; o.castShadow = true; g.add(o); return o; };
  const dome = (r, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  const windows = (w, y, z, n) => { for (let i = 0; i < n; i++) box(0.34, 0.42, 0.04, glass, -w / 2 + (w / (n + 1)) * (i + 1), y, z); };
  // the plinth: four cells square, a step up, with the village's colour ring
  box(3.9, 0.22, 3.9, stone); const ring = new THREE.Mesh(new THREE.TorusGeometry(1.96, 0.04, 6, 48), new THREE.MeshStandardMaterial({ color: 0x39ff88, emissive: 0x39ff88, emissiveIntensity: 1.2 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.23; g.add(ring);
  const y0 = 0.22;
  if (tier === 0) { // a cottage with a flag
    box(2.2, 1.5, 2.0, wall, 0, y0); cone(1.75, 1.0, roof, 0, y0 + 1.5); box(0.5, 0.9, 0.06, wood, 0, y0, 1.02); windows(2.2, y0 + 0.75, 1.02, 2);
    cyl(0.04, 0.04, 1.6, wood, 1.4, y0, 1.3, 6); const fl = box(0.6, 0.36, 0.03, std(0x39ff88), 1.7, y0 + 1.2, 1.3); spin.push((dt, t) => { fl.rotation.y = Math.sin(t * 2) * 0.25; });
  } else if (tier === 1) { // a house and its bell tower
    box(2.4, 1.6, 2.2, wall, -0.4, y0); cone(1.9, 1.0, roof, -0.4, y0 + 1.6); box(0.5, 0.95, 0.06, wood, -0.4, y0, 1.12); windows(2.4, y0 + 0.8, 1.12, 2);
    box(1.0, 2.8, 1.0, wall, 1.2, y0, -0.6); box(1.1, 0.12, 1.1, stone, 1.2, y0 + 2.8, -0.6); cone(0.8, 1.0, roof, 1.2, y0 + 2.92, -0.6);
    const bell = cyl(0.18, 0.26, 0.3, gold, 1.2, y0 + 2.3, -0.06, 12); spin.push((dt, t) => { bell.rotation.z = Math.sin(t * 1.6) * 0.2; });
  } else if (tier === 2) { // a town hall: columns, a pediment, a golden dome
    box(3.2, 1.9, 2.4, wall, 0, y0, -0.3); for (let i = 0; i < 4; i++) cyl(0.13, 0.13, 1.7, stone, -1.2 + i * 0.8, y0, 1.15, 10);
    box(3.3, 0.18, 0.9, stone, 0, y0 + 1.7, 1.0);
    const tri = new THREE.Shape(); tri.moveTo(-1.65, 0); tri.lineTo(1.65, 0); tri.lineTo(0, 0.62); tri.closePath(); // the pediment over the columns
    const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.9, bevelEnabled: false }), stone); ped.position.set(0, y0 + 1.88, 0.55); ped.castShadow = true; g.add(ped);
    box(1.6, 0.5, 1.6, wall, 0, y0 + 1.9, -0.3); dome(0.8, gold, 0, y0 + 2.4, -0.3); box(0.6, 1.1, 0.06, wood, 0, y0, 0.92); windows(3.2, y0 + 1.0, 0.92, 4);
  } else if (tier === 3) { // a castle: keep, four towers, banners
    box(2.2, 2.4, 2.2, wall, 0, y0);
    for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) { cyl(0.42, 0.46, 2.8, wall, x, y0, z, 12); cone(0.55, 1.0, roof, x, y0 + 2.8, z, 12); }
    for (let i = -1; i <= 1; i++) box(0.3, 0.3, 0.3, wall, i * 0.7, y0 + 2.4, 1.0);
    box(0.7, 1.2, 0.06, wood, 0, y0, 1.12); windows(2.2, y0 + 1.4, 1.12, 2);
    for (const x of [-0.6, 0.6]) { const b = box(0.36, 0.8, 0.03, std(0x2f86ff), x, y0 + 1.4, 1.13); spin.push((dt, t) => { b.rotation.x = Math.sin(t * 2 + x) * 0.08; }); }
  } else { // a palace: tiers, a golden dome, the ARCIRCLE rings turning over it
    box(3.4, 1.4, 3.0, wall, 0, y0); box(2.4, 1.2, 2.2, wall, 0, y0 + 1.4); dome(1.0, gold, 0, y0 + 2.6, 0); cyl(0.05, 0.05, 0.7, gold, 0, y0 + 3.55, 0, 6);
    for (const [x, z] of [[-1.6, 1.4], [1.6, 1.4], [-1.6, -1.4], [1.6, -1.4]]) { cyl(0.28, 0.3, 2.6, wall, x, y0, z, 12); dome(0.3, gold, x, y0 + 2.6, z); }
    windows(3.4, y0 + 0.5, 1.52, 5); windows(2.4, y0 + 1.85, 1.12, 3); box(0.8, 1.0, 0.06, gold, 0, y0, 1.52);
    const rings = new THREE.Group(); rings.position.y = y0 + 4.6;
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 10, 40), new THREE.MeshStandardMaterial({ color: 0x2f86ff, emissive: 0x2f86ff, emissiveIntensity: 1.6 }));
    const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 10, 40), new THREE.MeshStandardMaterial({ color: 0x39ff88, emissive: 0x39ff88, emissiveIntensity: 1.5 }));
    r1.position.x = -0.3; r2.position.x = 0.3; r2.rotation.x = Math.PI / 2; rings.add(r1, r2); g.add(rings);
    spin.push((dt, t) => { rings.rotation.y += dt * 0.8; rings.position.y = y0 + 4.6 + Math.sin(t * 1.5) * 0.1; });
  }
  // its name and level, over the roof
  const tags = { 0: 2.9, 1: 4.3, 2: 3.7, 3: 4.3, 4: 5.6 };
  if (K && K.label) { const lb = K.label(`Lv ${level}`, { accent: "#39ff88", size: 0.55, sub: "Village centre" }); lb.position.y = tags[tier]; lb.userData.vtag = true; g.add(lb); }
  g.userData = { level, tier, spin, h: tags[tier] - 0.6 };
  return g;
}

export function createVillage(ctx) {
  const { T, esc, toast, post, sess } = ctx;
  const el = document.createElement("aside"); el.className = "wp-mapsheet wv-sheet"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
  document.body.appendChild(el);
  let v = null, contest = null, tab = "village", busy = false, payNote = "", pick = [];
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const me = () => { const s = sess(); return s ? String(s.wallet).toLowerCase() : ""; };
  async function load() {
    const w = me();
    try {
      const [a, b] = await Promise.all([w ? fetch("/api/social?world=village&wallet=" + w, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)) : null, fetch("/api/social?world=contest", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))]);
      if (a) { v = a; ctx.onVillage && ctx.onVillage(v); }
      contest = b;
    } catch { /* offline: keep what we had */ }
  }
  const PARTS = [["bricks", "Bricks"], ["kinds", "Kinds of pieces"], ["colours", "Colours"], ["height", "Height"], ["shop", "Shop pieces"], ["trophies", "Trophies"], ["lights", "Lights"], ["plants", "Plants"], ["theme", "Theme"], ["size", "Island size"]];
  function villageHTML() {
    if (!me()) return `<p class="wv-note">${esc(T("Sign in with your wallet: your village's level, score and contest entries live with it."))}</p>`;
    if (!v) return `<p class="wv-note">${esc(T("Loading…"))}</p>`;
    const into = v.need ? Math.min(100, (100 * v.xp) / v.need) : 100;
    const parts = PARTS.filter(([k]) => (v.parts || {})[k]).map(([k, n]) => `<li><span>${esc(T(n))}</span><b>${fmt(v.parts[k])}</b></li>`).join("");
    const up = v.payable ? `<div class="wv-up"><p>${esc(T("Your village has the XP for level {n}. From level 5, each level is a Village upgrade: {c} $ARCIRCLE from your wallet (half is burned, half goes to the treasury).", { n: v.next, c: fmt(v.cost) }))}</p>${payNote ? `<p class="wv-st">${esc(payNote)}</p>` : ""}<button type="button" class="wv-gold" data-up>${esc(T("Upgrade to level {n} · {c} $ARCIRCLE", { n: v.next, c: fmt(v.cost) }))}</button></div>`
      : v.next && v.next >= 5 && v.xp >= (v.need || 0) ? "" : v.next ? `<p class="wv-note">${esc(v.next >= 5 ? T("Level {n} needs {x} XP, then a Village upgrade ({c} $ARCIRCLE).", { n: v.next, x: fmt(v.need), c: fmt(v.cost) }) : T("Level {n} at {x} XP: it comes by itself.", { n: v.next, x: fmt(v.need) }))}</p>` : "";
    return `<div class="wv-head"><div class="wv-badge"><small>${esc(T("Village"))}</small><b>${v.level}</b></div><div><h3>${esc(T(centreName(v.level)))}</h3>
        <div class="wv-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${v.need || v.xp}" aria-valuenow="${v.xp}"><i style="width:${into.toFixed(1)}%"></i></div>
        <small>${!v.need ? esc(T("{a} XP · the top level", { a: fmt(v.xp) })) : v.xp >= v.need ? esc(T("{a} XP · ready for level {n}", { a: fmt(v.xp), n: v.next })) : esc(T("{a} / {b} XP to level {n}", { a: fmt(v.xp), b: fmt(v.need), n: v.next }))}</small></div></div>
      ${up}
      <div class="wv-cols"><section><h4>${esc(T("Design score"))} <b>${fmt(v.score)}</b></h4><ul class="wv-parts">${parts || `<li><span>${esc(T("Build on your island to score"))}</span></li>`}</ul>
        <p class="wv-tip">${esc(T("A new best score adds to your village XP, and every like adds 10. More kinds of pieces, colours, height, lights, plants, shop pieces and trophies all score."))}</p></section>
      <section><h4>${esc(T("Village blessing"))}</h4><ul class="wv-parts"><li><span>${esc(T("XP from everything"))}</span><b>+${v.blessing.xp}%</b></li><li><span>${esc(T("Max HP"))}</span><b>+${v.blessing.hp}%</b></li></ul>
        <p class="wv-tip">${esc(T("+2% XP and +1% max HP for each village level after the first."))}</p>
        <button type="button" class="wp-btn" data-go>${esc(T("Go to my village"))}</button></section></div>`;
  }
  function contestHTML() {
    if (!contest) return `<p class="wv-note">${esc(T("Loading…"))}</p>`;
    const mine = me(), gm = isGM(mine), entered = contest.entries.some((e) => e.wallet === mine);
    const row = (e, i) => `<li><i>${i + 1}</i><b>${esc(e.name || e.wallet.slice(0, 6) + "…" + e.wallet.slice(-4))}</b><small>${esc(T("score {s} · ♥ {l}", { s: fmt(e.score), l: e.likes }))}</small>
      <button type="button" class="wp-link" data-visit="${esc(e.wallet)}">${esc(T("Visit"))}</button>${gm && !contest.winners && !isGM(e.wallet) ? `<button type="button" class="wp-btn wv-pickb" data-pick="${esc(e.wallet)}" aria-pressed="${pick.some((p) => p.wallet === e.wallet)}">${pick.findIndex((p) => p.wallet === e.wallet) >= 0 ? esc(T("Place {n}", { n: pick.findIndex((p) => p.wallet === e.wallet) + 1 })) : esc(T("Pick"))}</button>` : ""}</li>`;
    const winners = (list) => `<ol class="wv-win">${list.map((x) => `<li><i>${x.place}</i><b>${esc(x.name || x.wallet.slice(0, 6) + "…")}</b><em>${fmt(x.arcl)} ARCL</em></li>`).join("")}</ol>`;
    return `<p class="wv-note">${esc(T("Every week the GM picks the best villages; the winners get ARCL. This week's prize: {p} ARCL.", { p: fmt(contest.prize || 0) }))}</p>
      ${contest.winners ? `<h4>${esc(T("This week's winners"))}</h4>${winners(contest.winners)}` : gm ? "" : mine ? `<button type="button" class="${entered ? "wp-btn" : "wv-gold"}" data-enter ${entered ? "disabled" : ""}>${esc(entered ? T("Your village is entered") : T("Enter my village"))}</button>` : `<p class="wv-note">${esc(T("Sign in with your wallet to enter."))}</p>`}
      ${gm && !contest.winners ? `<div class="wv-gm"><b class="wv-gmtag">[GM]</b><span>${esc(T("Pick up to three villages in order, set each one's ARCL (100,000 at most in all), then confirm."))}</span>
        ${pick.map((p, i) => `<label>${esc(T("Place {n}", { n: i + 1 }))} <input type="number" min="0" max="100000" step="1000" value="${p.arcl}" data-arcl="${i}"> ARCL</label>`).join("")}
        <button type="button" class="wv-gold" data-confirm ${pick.length ? "" : "disabled"}>${esc(T("Confirm the winners"))}</button></div>` : ""}
      <h4>${esc(T("Entries this week ({n})", { n: contest.entries.length }))}</h4>
      ${contest.entries.length ? `<ol class="wv-entries">${contest.entries.slice(0, 50).map(row).join("")}</ol>` : `<p class="wv-note">${esc(T("No villages entered yet this week."))}</p>`}
      ${(contest.past || []).length ? `<h4>${esc(T("Past weeks"))}</h4>${contest.past.slice(0, 4).map((p) => `<p class="wv-past">${esc(p.week)}</p>${winners(p.winners)}`).join("")}` : ""}`;
  }
  function paint() {
    el.innerHTML = `<div class="wp-card"><div class="wp-sheet-head"><h2>${esc(T("My village"))}</h2><button type="button" class="wp-btn wp-x" data-x aria-label="${esc(T("Close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <nav class="wv-tabs"><button type="button" data-tab="village" aria-pressed="${tab === "village"}">${esc(T("Village"))}</button><button type="button" data-tab="contest" aria-pressed="${tab === "contest"}">${esc(T("Weekly contest"))}</button></nav>
      ${tab === "village" ? villageHTML() : contestHTML()}</div>`;
  }
  el.addEventListener("input", (e) => { const i = e.target.dataset && e.target.dataset.arcl; if (i != null && pick[+i]) pick[+i].arcl = Math.max(0, Math.min(100000, Math.floor(Number(e.target.value) || 0))); });
  el.addEventListener("click", async (e) => {
    if (e.target === el || e.target.closest("[data-x]")) { hide(); return; }
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; paint(); return; }
    if (b.hasAttribute("data-go")) { hide(); ctx.goVillage && ctx.goVillage(); return; }
    if (b.dataset.visit) { hide(); ctx.visit && ctx.visit(b.dataset.visit); return; }
    if (b.hasAttribute("data-up") && !busy) {
      busy = true; b.disabled = true;
      try { const ok = await ctx.pay("isleup", "", (t) => { payNote = t || ""; paint(); }); payNote = ""; if (ok) { await load(); toast(T("Your village is now level {n}", { n: v ? v.level : "" })); ctx.Snd && ctx.Snd.level && ctx.Snd.level(); } } finally { busy = false; paint(); }
      return;
    }
    if (b.hasAttribute("data-enter") && !busy) {
      const s = sess(); if (!s) return; busy = true;
      try { const r = await post({ action: "world-contest-enter", ...s }); if (r.ok) { contest = r.j.contest; toast(T("Your village is entered in this week's contest")); } else toast(T(r.j.error || "That didn't work")); } finally { busy = false; paint(); }
      return;
    }
    if (b.dataset.pick) { const w = b.dataset.pick, i = pick.findIndex((p) => p.wallet === w); if (i >= 0) pick.splice(i, 1); else if (pick.length < 3) pick.push({ wallet: w, arcl: pick.length ? 0 : contest.prize || 50000 }); paint(); return; }
    if (b.hasAttribute("data-confirm") && !busy) {
      const s = sess(); if (!s || !pick.length) return;
      if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = T("Tap again to confirm (it can't be changed)"); return; }
      busy = true;
      try { const r = await post({ action: "world-contest-pick", ...s, week: contest.week, winners: pick }); if (r.ok) { contest = r.j.contest; pick = []; toast(T("Winners picked and paid")); } else toast(T(r.j.error || "That didn't work")); } finally { busy = false; paint(); }
    }
  });
  function hide() { if (el.hidden) return; el.hidden = true; ctx.freeze(false); }
  async function show(t) { if (t) tab = t; el.hidden = false; ctx.freeze(true); paint(); await load(); if (!el.hidden) paint(); }
  return { show, hide, isOpen: () => !el.hidden, load, data: () => v };
}
