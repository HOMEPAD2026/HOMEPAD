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
    } catch (e) { console.warn("land island", e); } finally { p.busy = false; } // (tried again next time you come near)
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
  const closeSheets = () => document.querySelectorAll(".wp-st.wp-land").forEach((b) => (b._close ? b._close() : b.remove()));
  function sheet(cls, html) {
    if (ctx.closeAll) ctx.closeAll();
    closeSheets(); // (one LAND sheet at a time: the card replaces the map, and back)
    const box = document.createElement("div"); box.className = "wp-st wp-land " + cls; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("data-no-i18n", "");
    box.innerHTML = `<div class="wp-st-card"><button type="button" class="wp-st-x" aria-label="${esc(T("Close"))}">×</button>${html}</div>`;
    document.body.appendChild(box); ctx.freeze(true);
    const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); ctx.freeze(false); };
    box._close = close;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true); box.querySelector(".wp-st-x").addEventListener("click", close); box.addEventListener("click", (e) => { if (e.target === box) close(); });
    return { box, close };
  }
  const statusOf = (v) => (v.status === "sold" ? T("Sold") : v.status === "held" ? (v.heldBy === "you" ? T("Held for you") : T("Being bought")) : T("For sale"));
  // b-land2 (the owner's mock-ups): the picture of each village (ten island scenes, round the ring twice)
  const PIC = [1, 6, 3, 7, 4, 8, 5, 9, 10], img = (k) => `/images/land/isle-${String(k).padStart(2, "0")}.webp`;
  const picOf = (n) => { const v = view && view.villages[n - 1]; return v && v.status === "sold" ? img(2) : img(PIC[(n - 1) % PIC.length]); }; // (the gold house is a sold village's)
  const ICO = {
    pin: '<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
    palm: '<path d="M12 21V9M12 9c-2-3-6-3-8-1M12 9c2-3 6-3 8-1M12 9c-1-3-4-5-7-4M12 9c1-3 4-5 7-4M5 21h14"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>', hammer: '<path d="M14 6l4 4M12 8l4 4-8 8-4-4zM14 6l2-2 4 4-2 2"/>',
    bricks: '<rect x="3" y="5" width="8" height="5" rx="1"/><rect x="13" y="5" width="8" height="5" rx="1"/><rect x="7" y="12" width="10" height="5" rx="1"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M16 12.5h2M3 9h18"/>', list: '<path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
  };
  const ico = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICO[k]}</svg>`;
  function seaHTML(sel) {
    // the ring as an ellipse on the picture (the town in the middle), each village its island picture, number and status ring
    const isl = PLOTS.map((_, i) => { const v = view ? view.villages[i] : null, st = v ? v.status : "open", a = ((9 + i * 18) * Math.PI) / 180, L = 50 + Math.sin(a) * 42, Tp = 52 - Math.cos(a) * 40; // (evenly round the ring: the real spots bunch a little)
      return `<button type="button" class="wla-isl ${st}${sel === i + 1 ? " on" : ""}${view && view.mine === i + 1 ? " mine" : ""}" data-v="${i + 1}" style="left:${L.toFixed(1)}%;top:${Tp.toFixed(1)}%" aria-label="V${String(i + 1).padStart(2, "0")} · ${esc(v ? statusOf(v) : "")}"><img src="${picOf(i + 1)}" alt=""><b>${i + 1}</b></button>`; }).join("");
    return `<div class="wla-sea" role="group" aria-label="${esc(T("Map of the 20 villages"))}"><div class="wla-townpic"><img src="/images/land/town.webp" alt=""><span>${esc(T("Town"))}</span></div>${isl}</div>`;
  }
  async function open(sel) {
    const { box } = sheet("map", `<div class="wla-head"><img class="wla-palm l" src="/images/land/palm-l.webp" alt=""><img class="wla-palm r" src="/images/land/palm-r.webp" alt=""><span class="wla-ic" aria-hidden="true">🏝️</span><h2><span>ARCIRCLE</span> <em>LAND</em></h2><p>${esc(T("20 villages on the ring around the town. Buy one with $ARCIRCLE and your island stands there for everyone to see."))}</p></div><div class="wla-body"><i class="wp-skel" style="width:70%"></i></div>`);
    await refresh();
    const body = box.querySelector(".wla-body"); if (!body) return;
    if (!view) { body.innerHTML = `<p class="wp-st-note">${esc(T("Couldn't load LAND — try again"))}</p>`; return; }
    body.innerHTML = `${seaHTML(sel)}<div class="wla-sum"><b>${view.sold} / 20</b><small>${esc(T("sold"))}</small>${view.mine ? `<button type="button" class="wla-mine" data-v="${view.mine}">${esc(T("My village"))} V${String(view.mine).padStart(2, "0")} <i>›</i></button>` : ""}<p class="wla-legend"><i class="open"></i>${esc(T("For sale"))} <i class="held"></i>${esc(T("Being bought"))} <i class="sold"></i>${esc(T("Sold"))}</p></div>
      <ul class="wla-list">${view.villages.map((v) => `<li class="${v.status}"><button type="button" data-v="${v.n}"><img src="${picOf(v.n)}" alt=""><span class="t"><b>${esc(v.id)}</b><span>${v.status === "sold" ? esc(v.name || short(v.owner)) : fmt(v.price) + " $ARCIRCLE"}</span><em>${esc(statusOf(v))}</em></span><i>›</i></button></li>`).join("")}</ul>`;
    box.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) detail(Number(b.dataset.v)); });
  }
  function detail(n) {
    const v = view && view.villages[n - 1]; if (!v) return;
    const sold = v.status === "sold", mine = view.mine === n, canBuy = !sold && !view.mine && !(v.status === "held" && v.heldBy !== "you");
    const tile = (k, icon, t, sub, extra = "", tag = "button") => `<${tag} ${tag === "a" ? "" : 'type="button"'} class="wla-tile ${k}" ${extra}>${ico(icon)}<span><b>${esc(t)}</b><small>${esc(sub)}</small></span></${tag}>`;
    const prev = n > 1 ? n - 1 : 20, next = n < 20 ? n + 1 : 1, id2 = (k) => "V" + String(k).padStart(2, "0");
    const { box, close } = sheet("card", `<div class="wla-card">
      <div class="wla-info">
        <div class="wla-card-h"><b>${esc(v.id)}</b><span class="wla-st ${v.status}">${esc(statusOf(v))}</span></div>
        <div class="wla-pricebox"><img src="/images/brand/mark-sm-v2.webp" alt=""><span><small>${esc(T("Price"))}</small><b>${fmt(v.price)} $ARCIRCLE</b></span></div>
        ${sold ? `<div class="wla-owner"><small>${esc(T("Owner"))}</small><i class="av">${esc((v.name || "?").slice(0, 1).toUpperCase())}</i><b>${esc(v.name || short(v.owner))}</b><code>${esc(short(v.owner))}</code><button type="button" class="wla-copy" data-copyw="${esc(v.owner)}" title="${esc(T("Copy"))}">${ico("copy")}</button></div>` : ""}
        <ul class="wla-perks"><li>${ico("palm")}<span>${esc(T("Your island (My Island) stands on this village, for everyone in the town to see"))}</span></li><li>${ico("bricks")}<span>${esc(T("Build bigger: a 64×64 island and up to 20,000 bricks"))}</span></li><li>${ico("wallet")}<span>${esc(T("One village a wallet. Paid to the ARCIRCLE treasury from your own wallet."))}</span></li></ul>
      </div>
      <div class="wla-art ${v.status}"><img src="${sold ? "/images/land/hero.webp" : picOf(n)}" alt=""></div>
    </div>
    <p class="wp-st-status" data-st hidden></p>
    <div class="wla-tiles">${canBuy ? tile("buy", "coin", T("Buy with $ARCIRCLE"), fmt(v.price) + " $ARCIRCLE", "data-buy") : ""}${tile(canBuy ? "" : "go", "pin", T("Go there"), T("Move to this village"), "data-go")}${sold ? tile("", "palm", T("Visit the island"), T("See their island"), "data-visit") + (v.tx ? tile("", "compass", T("Explorer") + " ↗", T("View on explorer"), `href="${esc(EXP + "/tx/" + v.tx)}" target="_blank" rel="noopener"`, "a") : "") + tile(mine ? "" : "off", "hammer", T("Build my island"), mine ? T("Start building") : T("Only the owner"), mine ? "data-build" : "disabled") : ""}</div>
    <div class="wla-done" data-done hidden></div>
    <nav class="wla-nav"><button type="button" data-to="${prev}">‹ ${id2(prev)}</button><button type="button" class="all" data-back>${ico("list")} ${esc(T("All villages"))}</button><button type="button" data-to="${next}">${id2(next)} ›</button></nav>
    <p class="wp-st-note">${esc(view.mine && !mine && !sold ? T("You already own a village.") : T("Village production and rewards are planned, not part of buying. Nothing here pays out."))}</p>`);
    const $b = (q) => box.querySelector(q), st = (t) => { const e = $b("[data-st]"); if (e) { e.hidden = !t; e.textContent = t || ""; } };
    $b("[data-go]").addEventListener("click", () => { close(); goTo(n); });
    $b("[data-back]").addEventListener("click", () => open(n));
    box.querySelectorAll("[data-to]").forEach((b) => b.addEventListener("click", () => detail(Number(b.dataset.to))));
    const cw = $b("[data-copyw]"); if (cw) cw.addEventListener("click", async () => { try { await navigator.clipboard.writeText(cw.dataset.copyw); toast(T("Wallet address copied")); } catch { toast(cw.dataset.copyw); } });
    const vb = $b("[data-visit]"); if (vb) vb.addEventListener("click", () => { close(); if (ctx.visit) ctx.visit(v.owner); });
    const bb = $b("[data-build]"); if (bb) bb.addEventListener("click", () => { close(); if (ctx.myIsland) ctx.myIsland(); });
    const buy = $b("[data-buy]"); if (buy) buy.addEventListener("click", () => purchase(n, { box, st, buy }));
  }
  function goTo(n) { const p = plots[n - 1]; if (!p || !ctx.standAt) return; const d = Math.hypot(p.x, p.z) || 1; ctx.standAt(p.x - (p.x / d) * (PAD_R - 3), p.z - (p.z / d) * (PAD_R - 3), { x: p.x, z: p.z }); } // (on the pad's town-side edge, facing in)

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
  return { refresh, open, detail, close: closeSheets, tick, near, promptHTML, goTo, mine: () => (view ? view.mine || 0 : 0), plots: () => plots, view: () => view };
}
