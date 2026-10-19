// world-land.js — ARCIRCLE LAND in the town (b-land): the first 20 villages, on the ring past the hunting grounds
// (about 270 m out, all the way round: the walkable town now reaches 300 m and the hills start past it).
//
//   in the town  each village is a stone pad with a glowing rim and a sign: its number and price while it's for sale,
//                the owner's name once it's sold. A sold village shows its owner's island (world-island.js, as built
//                in My Island) standing on it — loaded only when you come near, dropped again when you leave
//   the sheets   the LAND map (the ring of 20, the town in the middle, sold / for sale / held) and a village's card:
//                Buy, Go there, Visit the island, the purchase on the explorer
//   buying       a 5-minute hold, then the player's own wallet sends the price in $ARCIRCLE to the ARCIRCLE treasury,
//                then the server reads the receipt (api/_world-land.mjs) and the village is theirs. One a wallet.
//   owners       build in My Island at 64×64 and up to 20,000 bricks; that island is what stands on their village
// Prices and rules: api/_world-land.mjs (the owner's plan v1.1). Nothing here pays anything out.
export const PLOTS = [[41.9, -264.7], [118.3, -253.8], [189.5, -189.5], [238.8, -121.7], [264.7, -41.9], [264.7, 41.9], [238.8, 121.7], [189.5, 189.5], [121.7, 238.8], [41.9, 264.7],
  [-41.9, 264.7], [-121.7, 238.8], [-189.5, 189.5], [-238.8, 121.7], [-278.9, 24.4], [-264.7, -41.9], [-238.8, -121.7], [-198.0, -198.0], [-152.5, -234.8], [-41.9, -264.7]];
export const PAD_R = 24;
const LOAD_D = 150, DROP_D = 230;

export function createLand(ctx) {
  const { THREE, K, planet, esc, T, toast, post, sess, Snd } = ctx;
  const EXP = String((ctx.CFG && ctx.CFG.BLOCK_EXPLORER) || "https://arc.etherscan.io").replace(/\/$/, "");
  const fmt = (n) => Number(n).toLocaleString(ctx.lang === "zh" ? "zh-CN" : ctx.lang === "ko" ? "ko-KR" : "en-US");
  const lc = (s) => String(s || "").toLowerCase(), short = (w) => w.slice(0, 6) + "…" + w.slice(-4);
  const pad64 = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
  let view = null, loading = null;

  // ---------------- the villages in the town ----------------
  const stone = new THREE.MeshStandardMaterial({ color: 0xcfd8e3, roughness: 0.85, metalness: 0.05 });
  const stone2 = new THREE.MeshStandardMaterial({ color: 0x9fb0c4, roughness: 0.9, metalness: 0.05 });
  const rimOpen = new THREE.MeshBasicMaterial({ color: 0x35d8d0, transparent: true, opacity: 0.9 }), rimSold = new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.95 });
  const wallM = new THREE.MeshBasicMaterial({ color: 0x35d8d0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
  const padGeo = new THREE.CylinderGeometry(PAD_R, PAD_R + 0.8, 0.36, 56), rimGeo = new THREE.TorusGeometry(PAD_R, 0.16, 6, 96), wallGeo = new THREE.CylinderGeometry(PAD_R, PAD_R, 1.1, 56, 1, true);
  const pillarGeo = new THREE.BoxGeometry(0.7, 2.4, 0.7), capGeo = new THREE.OctahedronGeometry(0.42, 0);
  const plots = PLOTS.map(([x, z], i) => {
    const g = new THREE.Group(); g.name = "land-" + (i + 1); g.position.set(x, 0, z); g.userData.radius = PAD_R - 2; g.userData.noBake = true;
    const padM = new THREE.Mesh(padGeo, stone); padM.position.y = 0.16; padM.receiveShadow = true; g.add(padM);
    const rim = new THREE.Mesh(rimGeo, rimOpen); rim.rotation.x = Math.PI / 2; rim.position.y = 0.38; g.add(rim);
    const wall = new THREE.Mesh(wallGeo, wallM); wall.position.y = 0.9; g.add(wall);
    // four corner stones with a light on each, facing the town
    const face = Math.atan2(-x, -z);
    for (let k = 0; k < 4; k++) { const a = face + Math.PI / 4 + k * Math.PI / 2, p = new THREE.Mesh(pillarGeo, stone2); p.position.set(Math.sin(a) * (PAD_R + 0.4), 1.2, Math.cos(a) * (PAD_R + 0.4)); p.castShadow = true; g.add(p);
      const c = new THREE.Mesh(capGeo, rimOpen); c.position.set(p.position.x, 2.75, p.position.z); g.add(c); g.userData["cap" + k] = c; }
    const beacon = K.makeBeacon ? K.makeBeacon(0x35d8d0, 14) : null; if (beacon) { beacon.position.set(Math.sin(face) * (PAD_R - 3), 0, Math.cos(face) * (PAD_R - 3)); g.add(beacon); }
    planet.add(g);
    return { n: i + 1, x, z, g, rim, wall, beacon, face, tag: null, isle: null, isleFor: "", want: "" };
  });
  function tagFor(p, v) {
    if (p.tag) { p.g.remove(p.tag); if (p.tag.material && p.tag.material.map) p.tag.material.map.dispose(); }
    const id = "V" + String(p.n).padStart(2, "0");
    const t = !v || v.status !== "sold"
      ? K.label(id + " · " + T("For sale"), { accent: "#35d8d0", sub: fmt(v ? v.price : 0) + " $ARCIRCLE", size: 1.5 })
      : K.label(v.name || short(v.owner), { accent: "#ffc861", pre: id, sub: "ARCIRCLE LAND", size: 1.5 });
    t.position.set(Math.sin(p.face) * (PAD_R - 3), 9, Math.cos(p.face) * (PAD_R - 3)); p.g.add(t); p.tag = t;
  }
  function paint() {
    plots.forEach((p) => {
      const v = view && view.villages[p.n - 1], sold = !!(v && v.status === "sold");
      p.rim.material = sold ? rimSold : rimOpen; p.wall.visible = !sold; for (let k = 0; k < 4; k++) p.g.userData["cap" + k].material = sold ? rimSold : rimOpen;
      p.want = sold ? v.owner : ""; if (!sold) dropIsle(p);
      tagFor(p, v);
    });
    if (ctx.labelsDirty) ctx.labelsDirty();
  }
  async function refresh() {
    if (loading) return loading;
    loading = (async () => { try { const s = sess(), r = await fetch("/api/social?world=land" + (s ? "&wallet=" + lc(s.wallet) : ""), { cache: "no-store" }); if (r.ok) { view = await r.json(); paint(); } } catch { /* the stock signs stay */ } finally { loading = null; } return view; })();
    return loading;
  }
  // an owner's island on their village: loaded near, dropped far (a town of 20 islands is a lot of bricks)
  function dropIsle(p) { if (!p.isle) return; p.g.remove(p.isle); p.isle.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); p.isle = null; p.isleFor = ""; }
  async function loadIsle(p) {
    if (p.busy || !p.want || p.isleFor === p.want) return; p.busy = true;
    try {
      const r = await fetch("/api/social?world=island&wallet=" + p.want); const j = r.ok ? await r.json() : null;
      if (j && j.data && ctx.island && ctx.island.makeStatic) {
        const sg = ctx.island.makeStatic(j.data);
        if (sg) { dropIsle(p); const N = sg.userData.N || 36, k = Math.min(1, (PAD_R * 2 - 6) / N); sg.scale.setScalar(k); sg.position.y = 0.36; sg.rotation.y = p.face + Math.PI; p.g.add(sg); p.isle = sg; p.isleFor = p.want;
          if (p.tag) p.tag.position.y = Math.max(9, (sg.userData.h || 0) * k + 4); }
      } else p.isleFor = p.want; // (nothing built yet: the pad stays bare)
    } catch { /* try again next time you come near */ } finally { p.busy = false; }
  }
  let tT = 0;
  function tick(dt, t, me) {
    plots.forEach((p, i) => { const s = 0.6 + Math.sin(t * 2 + i) * 0.25; p.wall.material.opacity = 0.12 + Math.sin(t * 1.5 + i) * 0.05; for (let k = 0; k < 4; k++) p.g.userData["cap" + k].rotation.y = t * 1.2; if (p.beacon && p.beacon.userData.spin) p.beacon.userData.spin(dt, t); void s; });
    if ((tT += dt) < 0.8 || !me) return; tT = 0;
    plots.forEach((p) => { const d = Math.hypot(me.x - p.x, me.z - p.z); if (p.want && d < LOAD_D) loadIsle(p); else if (p.isle && d > DROP_D) dropIsle(p); });
  }
  const near = (consider) => plots.forEach((p) => consider(p.g, "land", { n: p.n }, 2.6));
  const promptHTML = (n) => { const v = view && view.villages[n - 1], id = "V" + String(n).padStart(2, "0"); return v && v.status === "sold" ? T("Visit {x}", { x: `<b>${esc(T("{name}'s village", { name: v.name || short(v.owner) }))}</b>` }) : T("See {x}", { x: `<b>ARCIRCLE LAND ${id}</b>` }); };

  // ---------------- the sheets ----------------
  function sheet(cls, html) {
    if (ctx.closeAll) ctx.closeAll();
    const box = document.createElement("div"); box.className = "wp-st wp-land " + cls; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("data-no-i18n", "");
    box.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(T("Close"))}">×</button>${html}</div>`;
    document.body.appendChild(box); ctx.freeze(true);
    const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); ctx.freeze(false); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true); box.querySelector(".wp-st-x").addEventListener("click", close); box.addEventListener("click", (e) => { if (e.target === box) close(); });
    return { box, close };
  }
  const statusOf = (v) => (v.status === "sold" ? T("Sold") : v.status === "held" ? (v.heldBy === "you" ? T("Held for you") : T("Being bought")) : T("For sale"));
  function mapSVG(sel) {
    const S = 300, k = (S / 2 - 22) / 290;
    const dots = PLOTS.map(([x, z], i) => { const v = view ? view.villages[i] : null, st = v ? v.status : "open", cx = S / 2 + x * k, cy = S / 2 + z * k;
      return `<g class="wl-dot ${st}${sel === i + 1 ? " on" : ""}${view && view.mine === i + 1 ? " mine" : ""}" data-v="${i + 1}" transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)})"><circle r="11"/><text y="4">${i + 1}</text></g>`; }).join("");
    return `<svg class="wl-map" viewBox="0 0 ${S} ${S}" role="img" aria-label="${esc(T("Map of the 20 villages"))}"><circle class="wl-ring" cx="${S / 2}" cy="${S / 2}" r="${(270 * k).toFixed(1)}"/><circle class="wl-town" cx="${S / 2}" cy="${S / 2}" r="${(150 * k).toFixed(1)}"/><text class="wl-town-t" x="${S / 2}" y="${S / 2 + 4}">${esc(T("Town"))}</text>${dots}</svg>`;
  }
  async function open(sel) {
    const { box } = sheet("map", `<div class="wl-head"><span class="wl-ic" aria-hidden="true">🏝️</span><h2>ARCIRCLE LAND</h2><p>${esc(T("20 villages on the ring around the town. Buy one with $ARCIRCLE and your island stands there for everyone to see."))}</p></div><div class="wl-body"><i class="wp-skel" style="width:70%"></i></div>`);
    await refresh();
    const body = box.querySelector(".wl-body"); if (!body) return;
    if (!view) { body.innerHTML = `<p class="wp-st-note">${esc(T("Couldn't load LAND — try again"))}</p>`; return; }
    body.innerHTML = `<div class="wl-top">${mapSVG(sel)}<div class="wl-sum"><b>${view.sold} / 20</b><small>${esc(T("sold"))}</small>${view.mine ? `<button type="button" class="wp-st-buy" data-v="${view.mine}">${esc(T("My village"))} V${String(view.mine).padStart(2, "0")}</button>` : ""}<p class="wl-legend"><i class="open"></i>${esc(T("For sale"))} <i class="held"></i>${esc(T("Being bought"))} <i class="sold"></i>${esc(T("Sold"))}</p></div></div>
      <ul class="wl-list">${view.villages.map((v) => `<li class="${v.status}"><button type="button" data-v="${v.n}"><b>${esc(v.id)}</b><span>${v.status === "sold" ? esc(v.name || short(v.owner)) : fmt(v.price) + " $ARCIRCLE"}</span><em>${esc(statusOf(v))}</em></button></li>`).join("")}</ul>`;
    box.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) detail(Number(b.dataset.v)); });
  }
  function detail(n) {
    const v = view && view.villages[n - 1]; if (!v) return;
    const sold = v.status === "sold", mine = view.mine === n, canBuy = !sold && !view.mine && !(v.status === "held" && v.heldBy !== "you");
    const { box, close } = sheet("card", `<div class="wl-card-h"><b>${esc(v.id)}</b><span class="wl-st ${v.status}">${esc(statusOf(v))}</span></div>
      <p class="wl-price"><small>${esc(T("Price"))}</small><b>${fmt(v.price)} $ARCIRCLE</b></p>
      ${sold ? `<p class="wl-owner"><small>${esc(T("Owner"))}</small><b>${esc(v.name || short(v.owner))}</b><code>${esc(short(v.owner))}</code></p>` : ""}
      <ul class="wl-perks"><li>${esc(T("Your island (My Island) stands on this village, for everyone in the town to see"))}</li><li>${esc(T("Build bigger: a 64×64 island and up to 20,000 bricks"))}</li><li>${esc(T("One village a wallet. Paid to the ARCIRCLE treasury from your own wallet."))}</li></ul>
      <p class="wp-st-status" data-st hidden></p>
      <div class="wl-acts">${canBuy ? `<button type="button" class="wp-st-buy" data-buy>${esc(T("Buy with $ARCIRCLE"))}</button>` : ""}<button type="button" class="wp-gmr-b" data-go>${esc(T("Go there"))}</button>${sold ? `<button type="button" class="wp-gmr-b" data-visit>${esc(T("Visit the island"))}</button>${v.tx ? `<a class="wp-gmr-b" href="${esc(EXP + "/tx/" + v.tx)}" target="_blank" rel="noopener">${esc(T("Explorer"))} ↗</a>` : ""}` : ""}${mine ? `<button type="button" class="wp-gmr-b" data-build>${esc(T("Build my island"))}</button>` : ""}<button type="button" class="wp-gmr-b" data-back>${esc(T("All villages"))}</button></div>
      <div class="wl-done" data-done hidden></div>
      <p class="wp-st-note">${esc(view.mine && !mine ? T("You already own a village.") : T("Village production and rewards are planned, not part of buying. Nothing here pays out."))}</p>`);
    const $b = (q) => box.querySelector(q), st = (t) => { const e = $b("[data-st]"); if (e) { e.hidden = !t; e.textContent = t || ""; } };
    $b("[data-go]").addEventListener("click", () => { close(); goTo(n); });
    $b("[data-back]").addEventListener("click", () => open(n));
    const vb = $b("[data-visit]"); if (vb) vb.addEventListener("click", () => { close(); if (ctx.visit) ctx.visit(v.owner); });
    const bb = $b("[data-build]"); if (bb) bb.addEventListener("click", () => { close(); if (ctx.myIsland) ctx.myIsland(); });
    const buy = $b("[data-buy]"); if (buy) buy.addEventListener("click", () => purchase(n, { box, st, buy }));
  }
  function goTo(n) { const p = plots[n - 1]; if (!p || !ctx.standAt) return; const d = Math.hypot(p.x, p.z) || 1; ctx.standAt(p.x - (p.x / d) * (PAD_R + 4), p.z - (p.z / d) * (PAD_R + 4), { x: p.x, z: p.z }); }

  // ---------------- buying: hold → the wallet's transfer to the treasury → the receipt ----------------
  let busy = false;
  async function purchase(n, ui) {
    if (busy) return; const s = sess();
    if (!s) { ui.st(T("Sign in with your wallet first")); if (ctx.signIn) ctx.signIn(); return; }
    const AC = ctx.AC; if (!AC) { ui.st(T("Wallet connect isn't available here.")); return; }
    busy = true; ui.buy.disabled = true; let tx = null;
    try {
      ui.st(T("Holding the village for you…"));
      const h = await post({ action: "world-land-reserve", ...s, n });
      if (!h.ok) { ui.st(String((h.j && h.j.error) || T("Couldn't hold the village — try again"))); return; }
      if (!AC.live || !AC.live()) await AC.connect();
      if (lc(ctx.addr()) !== lc(s.wallet)) { ui.st(T("Switch your wallet to the one you signed in with ({w})", { w: short(s.wallet) })); return; }
      const prov = await AC.provider();
      try { await prov.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x13b2" }] }); } catch (e2) { if (e2 && e2.code === 4001) throw e2; }
      ui.st(T("Confirm {n} $ARCIRCLE in your wallet…", { n: fmt(h.j.price) }));
      tx = await prov.request({ method: "eth_sendTransaction", params: [{ from: ctx.addr(), to: h.j.token, data: "0xa9059cbb" + pad64(h.j.to) + pad64(BigInt(h.j.amount).toString(16)) }] });
      ui.st(T("Sent. Waiting for the transaction to confirm…"));
      let r = null; for (let i = 0; i < 40; i++) { await new Promise((ok) => setTimeout(ok, i ? 3000 : 2500)); r = await post({ action: "world-land-confirm", ...sess(), n, tx }); if (r.status !== 202 && r.status < 500) break; }
      const d = ui.box.querySelector("[data-done]");
      if (r && r.ok) {
        ui.st(""); ui.buy.hidden = true; if (Snd && (Snd.win || Snd.level)) try { (Snd.win || Snd.level)(); } catch { /* quiet */ }
        if (d) { d.hidden = false; d.innerHTML = `<b>🎉 ${esc(T("V{n} is yours!", { n: String(n).padStart(2, "0") }))}</b><span>${esc(T("Your island now stands on your village. Build it bigger in My Island."))}</span><a class="wp-gmr-b" href="${esc(EXP + "/tx/" + tx)}" target="_blank" rel="noopener">${esc(T("Explorer"))} ↗</a>`; }
        await refresh(); if (ctx.onOwn) ctx.onOwn(n);
      } else {
        ui.st(String((r && r.j && r.j.error) || T("Sent, but the game couldn't confirm it yet — it will once the chain shows it. Open the village again in a minute.")));
        if (d && tx) { d.hidden = false; d.innerHTML = `<code>${esc(tx)}</code><a class="wp-gmr-b" href="${esc(EXP + "/tx/" + tx)}" target="_blank" rel="noopener">${esc(T("Explorer"))} ↗</a>`; }
      }
    } catch (err) { ui.st(tx ? T("Sent, but the game couldn't confirm it yet — it will once the chain shows it. Open the village again in a minute.") : err && err.code === 4001 ? T("Cancelled in the wallet") : T("The transfer didn't go through: {e}", { e: String((err && err.message) || err).slice(0, 90) })); }
    finally { busy = false; ui.buy.disabled = false; }
  }
  // a payment that went through but wasn't noted (the page closed while waiting): the next open retries it
  refresh();
  return { refresh, open, detail, tick, near, promptHTML, goTo, mine: () => (view ? view.mine || 0 : 0), plots: () => plots, view: () => view };
}
