// world-rpg.js — your character in ARCIRCLE World: stats that grow with your level, gear in seven slots, the bag, potions,
// the Forge (gear and supplies for ARCL, enhancing with scrap) and the gear you can see on your character.
//
// Saved with the rest of your progress (P.rpg → world-save, checked for shape in api/_world.mjs). Gear dropped by
// scammers only ever turns into scrap, never into ARCL; the Forge sells for ARCL through the server.
import { SLOTS, SLOT_NAME, RARITY, TIERS, BASES, baseId, parseBase, itemStats, itemName, STAT_NAME, statsOf, FORGE_PRICE, FORGE_SUPPLY, forgeId } from "./world-rpg-data.js";
export * from "./world-rpg-data.js";
const BAG = 24;
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("") + Date.now().toString(36).slice(-2);
// one icon per slot, drawn in the item's rarity colour
const ICON = {
  weapon: '<path d="M14.5 3.5h6v6L9 21l-6-6z"/><path d="M5 13l6 6M3 21l3-3"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="M12 7v10"/>',
  armor: '<path d="M8 3 4 6l1 6 3-1v10h8V11l3 1 1-6-4-3c-.5 2-2 3-4 3S8.5 5 8 3z"/>',
  helm: '<path d="M4 15a8 8 0 0 1 16 0v3H4z"/><path d="M4 15h16M12 7v8"/>',
  ring: '<circle cx="12" cy="14" r="6"/><path d="M9 5l3-2 3 2-3 3z"/>',
  boots: '<path d="M7 3h5v9l7 3v4H5V12z"/><path d="M5 19h14"/>',
  necklace: '<path d="M5 4c0 6 3 9 7 9s7-3 7-9"/><path d="M12 13l-2.5 3 2.5 4 2.5-4z"/>',
};
export const iconSvg = (slot, color) => `<svg viewBox="0 0 24 24" aria-hidden="true" style="--ic:${color}">${ICON[slot] || ""}</svg>`;

/// ctx: { T, lang, esc, toast, P, save(), level(), post(b), sess(), Snd, freeze(on), avatar(), onStats(s), arclRefresh(), arclBal() }
export function createRpg(ctx) {
  const { esc, P } = ctx;
  const LW = { ko: { Weapon: "무기", Shield: "방패", Armor: "갑옷", Helmet: "투구", Ring: "반지", Boots: "신발", Necklace: "목걸이", Attack: "공격력", Defense: "방어력", Critical: "치명타", Speed: "이동속도", Common: "일반", Uncommon: "고급", Rare: "희귀", Epic: "영웅", Legendary: "전설", Equip: "장착", Unequip: "해제", Enhance: "강화", Salvage: "분해", Sort: "정렬", Character: "캐릭터", Bag: "가방", Scrap: "고철", Forge: "대장간", Supplies: "보급품", Buy: "구매", Level: "레벨", Sets: "세트", Gear: "장비", Accessories: "장신구" },
    zh: { Weapon: "武器", Shield: "盾牌", Armor: "铠甲", Helmet: "头盔", Ring: "戒指", Boots: "靴子", Necklace: "项链", Attack: "攻击", Defense: "防御", Critical: "暴击", Speed: "移速", Common: "普通", Uncommon: "优秀", Rare: "稀有", Epic: "史诗", Legendary: "传说", Equip: "装备", Unequip: "卸下", Enhance: "强化", Salvage: "分解", Sort: "整理", Character: "角色", Bag: "背包", Scrap: "废料", Forge: "铁匠铺", Supplies: "补给", Buy: "购买", Level: "等级", Sets: "套装", Gear: "装备", Accessories: "饰品" } }[ctx.lang] || {};
  const T = (s, v) => (LW[s] != null ? LW[s] : ctx.T(s, v));
  const R = () => {
    if (!P.rpg || typeof P.rpg !== "object") P.rpg = {};
    const r = P.rpg; r.eq = r.eq || {}; r.bag = Array.isArray(r.bag) ? r.bag : []; r.scrap = r.scrap || 0; r.hp = r.hp ?? 3; r.sp = r.sp ?? 2; r.recall = r.recall || 0;
    if (!r.starter) { r.starter = 1; r.eq.weapon = r.eq.weapon || { id: rid(), b: baseId("weapon", 0), r: 0, lv: 1, p: 0 }; r.eq.armor = r.eq.armor || { id: rid(), b: baseId("armor", 0), r: 0, lv: 1, p: 0 }; }
    return r;
  };
  R();
  let cache = null;
  const stats = () => (cache = cache || statsOf(ctx.level(), R().eq));
  const changed = (why) => { cache = null; ctx.save(); ctx.onStats(stats()); if (open) paint(); dress(); if (why) ctx.toast(why); };

  // ---------------- items ----------------
  function addItem(it, quiet) {
    const r = R();
    if (r.bag.length >= BAG) { const s = scrapOf(it); r.scrap += s; changed(); if (!quiet) ctx.toast(T("Bag full: {x} became {n} scrap", { x: itemName(it), n: s })); return false; }
    r.bag.push(it); changed(); return true;
  }
  const scrapOf = (it) => Math.round((2 + (it.lv || 1)) * (1 + (it.r || 0) * 1.5) * (1 + (it.p || 0) * 0.5));
  const enhanceCost = (it) => Math.round(((it.p || 0) + 1) * 12 * (1 + (it.r || 0)) * (1 + (it.lv || 1) / 20));
  /// a drop from a scammer of level lv: rank "", "elite" or "boss"; null when nothing drops
  function rollDrop(lv, rank) {
    const chance = rank === "boss" ? 1 : rank === "elite" ? 0.55 : 0.16;
    if (Math.random() > chance) return null;
    const slot = SLOTS[Math.floor(Math.random() * SLOTS.length)];
    const tier = Math.max(0, Math.min(4, TIERS.filter((t) => t.lv <= lv).length - 1));
    let roll = Math.random() * 100 + (rank === "boss" ? 55 : rank === "elite" ? 25 : 0) + lv * 0.6, r = 0;
    if (roll > 99) r = 4; else if (roll > 90) r = 3; else if (roll > 72) r = 2; else if (roll > 45) r = 1;
    if (r === 4 && rank !== "boss") r = 3; // Legendary only from bosses
    return { id: rid(), b: baseId(slot, tier), r, lv: Math.max(1, Math.min(60, lv)), p: 0 };
  }
  function equip(id) {
    const r = R(), i = r.bag.findIndex((x) => x.id === id); if (i < 0) return;
    const it = r.bag[i], p = parseBase(it.b); if (!p) return;
    if (TIERS[p.tier].lv > ctx.level()) { ctx.toast(T("Needs level {n}", { n: TIERS[p.tier].lv })); return; }
    r.bag.splice(i, 1); if (r.eq[p.slot]) r.bag.splice(i, 0, r.eq[p.slot]); r.eq[p.slot] = it;
    ctx.Snd.place && ctx.Snd.place(); changed();
  }
  function unequip(slot) { const r = R(); if (!r.eq[slot]) return; if (r.bag.length >= BAG) { ctx.toast(T("Your bag is full")); return; } r.bag.push(r.eq[slot]); delete r.eq[slot]; changed(); }
  function salvage(id) { const r = R(), i = r.bag.findIndex((x) => x.id === id); if (i < 0) return; const s = scrapOf(r.bag[i]); r.scrap += s; r.bag.splice(i, 1); sel = null; changed(T("+{n} scrap", { n: s })); }
  function enhance(id) {
    const r = R(), it = r.bag.find((x) => x.id === id) || Object.values(r.eq).find((x) => x && x.id === id); if (!it) return;
    if ((it.p || 0) >= 10) { ctx.toast(T("Already +10")); return; }
    const c = enhanceCost(it); if (r.scrap < c) { ctx.toast(T("Needs {n} scrap", { n: c })); return; }
    r.scrap -= c; it.p = (it.p || 0) + 1; ctx.Snd.chest && ctx.Snd.chest(); hammer(); changed(T("{x} is now +{n}", { x: itemName({ ...it, p: 0 }), n: it.p }));
  }
  function sortBag() { const r = R(); r.bag.sort((a, b) => (b.r - a.r) || (b.lv - a.lv) || SLOTS.indexOf(parseBase(a.b).slot) - SLOTS.indexOf(parseBase(b.b).slot)); changed(); }
  function salvageCommons() { const r = R(); let s = 0; r.bag = r.bag.filter((x) => { if ((x.r || 0) === 0 && !(x.p > 0)) { s += scrapOf(x); return false; } return true; }); r.scrap += s; changed(s ? T("+{n} scrap", { n: s }) : T("No common gear to salvage")); }
  function usePotion(kind) {
    const r = R(); if (!(r[kind] > 0)) { ctx.toast(kind === "hp" ? T("No health potions: the Forge sells them") : T("No mana potions: the Forge sells them")); return false; }
    r[kind]--; ctx.save(); if (open) paint(); return true;
  }

  // ---------------- gear you can see ----------------
  // the Kenney characters have arm-left / arm-right / head bones: a blade in the right hand, a shield on the left
  // arm, a helmet on the head, a glow on the chest for armour; colours follow rarity
  let worn = [];
  function dress() {
    const av = ctx.avatar(); worn.forEach((m) => m.parent && m.parent.remove(m)); worn = [];
    if (!av || av.bot) return;
    const THREE = ctx.THREE, eq = R().eq;
    const bone = (n) => { let b = null; av.obj.traverse((o) => { if (!b && o.name === n) b = o; }); return b; };
    const put = (b, mesh, pos, rot) => { if (!b) return; const ws = new THREE.Vector3(); b.getWorldScale(ws); const g = new THREE.Group(); g.scale.setScalar(1 / (ws.x || 1)); g.position.copy(pos).divideScalar(ws.x || 1); if (rot) g.rotation.set(...rot); g.add(mesh); b.add(g); worn.push(g); };
    const mat = (it, metal = 0.7) => { const c = new THREE.Color(RARITY[it.r || 0].color); return new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: 0.3, emissive: c, emissiveIntensity: (it.r || 0) >= 3 ? 0.6 : (it.r || 0) >= 2 ? 0.3 : 0.08 }); };
    if (eq.weapon) { const g = new THREE.Group(); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.95, 0.18), mat(eq.weapon, 0.9)); blade.position.y = -0.62; const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.38), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, metalness: 0.5 })); guard.position.y = -0.12; const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0x2a1a10 })); grip.position.y = 0; g.add(blade, guard, grip); put(bone("arm-right"), g, new THREE.Vector3(0.02, -0.72, 0.12), [0.25, 0, 0]); }
    if (eq.shield) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 6), mat(eq.shield, 0.6)); s.rotation.z = Math.PI / 2; const boss = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.9, roughness: 0.2 })); boss.position.x = -0.04; s.add(boss); put(bone("arm-left"), s, new THREE.Vector3(-0.16, -0.5, 0.05)); }
    if (eq.helm) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(eq.helm, 0.7)); h.scale.set(1.08, 0.75, 1.08); const crest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.5), mat(eq.helm, 0.5)); crest.position.y = 0.4; h.add(crest); put(bone("head"), h, new THREE.Vector3(0, 0.62, 0)); }
    if (eq.armor) { const a = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 32), mat(eq.armor, 0.6)); a.rotation.x = Math.PI / 2; put(bone("torso"), a, new THREE.Vector3(0, 0.42, 0)); }
    if (eq.necklace) { const n = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), mat(eq.necklace, 0.3)); put(bone("torso"), n, new THREE.Vector3(0, 0.55, 0.3)); }
  }

  // ---------------- the character sheet ----------------
  const el = document.createElement("div"); el.className = "wr-sheet"; el.id = "wr-inv"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
  document.body.appendChild(el);
  let open = false, sel = null, view = "inv", forgeTab = "gear";
  const rc = (it) => RARITY[it.r || 0].color;
  const tile = (it, attrs = "") => it ? `<button type="button" class="wr-tile r${it.r || 0}${sel === it.id ? " sel" : ""}" ${attrs} style="--rc:${rc(it)}" title="${esc(itemName(it))}">${iconSvg(parseBase(it.b).slot, rc(it))}${it.p ? `<b>+${it.p}</b>` : ""}<small>${it.lv}</small></button>` : "";
  const statLine = (k, v, d) => `<li><span>${esc(T(STAT_NAME[k]))}</span><b>${k === "crit" || k === "spd" ? v + "%" : v}</b>${d ? `<i class="${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(Math.round(d * 10) / 10)}</i>` : ""}</li>`;
  function detail(it) {
    if (!it) return `<div class="wr-detail empty"><p>${esc(T("Pick a piece of gear to see it here."))}</p></div>`;
    const p = parseBase(it.b), on = R().eq[p.slot] && R().eq[p.slot].id === it.id, cur = R().eq[p.slot], g = itemStats(it), c = cur && !on ? itemStats(cur) : {};
    const keys = [...new Set([...Object.keys(g), ...Object.keys(c)])];
    const need = TIERS[p.tier].lv;
    return `<div class="wr-detail" style="--rc:${rc(it)}"><div class="wr-d-h">${iconSvg(p.slot, rc(it))}<div><h3>${esc(itemName(it))}</h3><small>${esc(T(RARITY[it.r || 0].name))} · ${esc(T(SLOT_NAME[p.slot]))} · ${esc(T("Lv {n}", { n: it.lv }))}</small></div></div>
      <ul class="wr-stats">${keys.map((k) => statLine(k, g[k] || 0, on || !cur ? 0 : (g[k] || 0) - (c[k] || 0))).join("")}</ul>
      <p class="wr-set">${esc(T("{x} set", { x: TIERS[p.tier].set }))}${need > ctx.level() ? ` · <span class="need">${esc(T("Needs level {n}", { n: need }))}</span>` : ""}</p>
      <div class="wr-acts">${on ? `<button type="button" data-unequip="${p.slot}">${esc(T("Unequip"))}</button>` : `<button type="button" class="go" data-equip="${it.id}" ${need > ctx.level() ? "disabled" : ""}>${esc(T("Equip"))}</button>`}
      <button type="button" data-enhance="${it.id}" ${(it.p || 0) >= 10 ? "disabled" : ""}>${esc(T("Enhance"))} <small>${(it.p || 0) >= 10 ? "MAX" : esc(T("{n} scrap", { n: enhanceCost(it) }))}</small></button>
      ${on ? "" : `<button type="button" class="warn" data-salvage="${it.id}">${esc(T("Salvage"))} <small>+${scrapOf(it)}</small></button>`}</div></div>`;
  }
  const findItem = (id) => R().bag.find((x) => x.id === id) || Object.values(R().eq).find((x) => x && x.id === id) || null;
  function invHTML() {
    const r = R(), s = stats();
    const slot = (k) => `<div class="wr-slot s-${k}">${r.eq[k] ? tile(r.eq[k], `data-pick="${r.eq[k].id}"`) : `<span class="wr-empty-slot">${iconSvg(k, "rgba(222,233,244,.25)")}<small>${esc(T(SLOT_NAME[k]))}</small></span>`}</div>`;
    return `<div class="wr-grid">
      <section class="wr-doll"><h3>${esc(T("Gear"))}</h3><div class="wr-paper">${SLOTS.map(slot).join("")}<div class="wr-avatar"><span>${esc(T("Lv {n}", { n: ctx.level() }))}</span></div></div>
        <ul class="wr-stats big">${["atk", "def", "hp", "sp", "crit", "spd"].map((k) => statLine(k, s[k])).join("")}</ul>
        ${s.sets.length ? `<p class="wr-sets">${s.sets.map((x) => esc(T("{x} set ({n})", { x: x.set, n: x.need }))).join(" · ")}</p>` : `<p class="wr-sets dim">${esc(T("Wear 2, 4 or 7 pieces of one set for a bonus."))}</p>`}</section>
      <section class="wr-bag"><div class="wr-bag-h"><h3>${esc(T("Bag"))} <small>${r.bag.length}/${BAG}</small></h3><span class="wr-res"><b>${r.scrap}</b> ${esc(T("Scrap"))} · <b>${r.hp}</b> ${esc(T("health potions"))} · <b>${r.sp}</b> ${esc(T("mana potions"))}</span></div>
        <div class="wr-cells">${Array.from({ length: BAG }, (_, i) => `<div class="wr-cell">${r.bag[i] ? tile(r.bag[i], `data-pick="${r.bag[i].id}"`) : ""}</div>`).join("")}</div>
        <div class="wr-bag-f"><button type="button" data-sort>${esc(T("Sort"))}</button><button type="button" data-junk>${esc(T("Salvage commons"))}</button><button type="button" class="gold" data-forge>${esc(T("Forge"))}</button></div>
        ${detail(sel && findItem(sel))}</section></div>`;
  }
  // ---------------- the Forge ----------------
  function forgeHTML() {
    const lv = ctx.level(), bal = ctx.arclBal();
    const tabs = [["gear", "Gear"], ["acc", "Accessories"], ["supplies", "Supplies"], ["enhance", "Enhance"]];
    let body = "";
    if (forgeTab === "supplies") body = `<div class="wr-forge-grid">${Object.entries(FORGE_SUPPLY).map(([id, x]) => `<article class="wr-fcard"><div class="wr-fart sup-${x.kind}">${x.kind === "recall" ? '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v4L6 13a6 6 0 0 0 12 0l-4-6V3"/></svg>'}</div><h4>${esc(T(x.name))}</h4><button type="button" class="wr-buy" data-buy="${id}"><img src="/images/arcl-64.png" alt="" width="18" height="18">${x.arcl}</button></article>`).join("")}</div>`;
    else if (forgeTab === "enhance") { const all = [...Object.values(R().eq).filter(Boolean), ...R().bag]; body = `<p class="wr-note">${esc(T("Enhancing always works: it costs scrap, which you get by salvaging gear. Each + adds 8% to the piece."))} <b>${R().scrap} ${esc(T("Scrap"))}</b></p><div class="wr-cells enh">${all.map((it) => `<div class="wr-cell">${tile(it, `data-pick="${it.id}"`)}</div>`).join("")}</div>${detail(sel && findItem(sel))}`; }
    else {
      const slots = forgeTab === "gear" ? ["weapon", "shield", "armor", "helm"] : ["ring", "boots", "necklace"];
      body = `<div class="wr-forge-grid">${slots.flatMap((sl) => [0, 1, 2, 3].map((t) => { const it = { b: baseId(sl, t), r: t, lv: TIERS[t].lv, p: 0 }, g = itemStats(it), ok = lv >= TIERS[t].lv; return `<article class="wr-fcard${ok ? "" : " locked"}" style="--rc:${rc(it)}"><div class="wr-fart">${iconSvg(sl, rc(it))}</div><h4>${esc(BASES[sl][t])}</h4><small>${esc(T(RARITY[t].name))} · ${esc(T("Lv {n}", { n: TIERS[t].lv }))}</small><p>${Object.entries(g).map(([k, v]) => `${esc(T(STAT_NAME[k]))} +${v}${k === "crit" || k === "spd" ? "%" : ""}`).join(" · ")}</p><button type="button" class="wr-buy" data-buy="${forgeId(sl, t)}" ${ok ? "" : "disabled"}>${ok ? `<img src="/images/arcl-64.png" alt="" width="18" height="18">${FORGE_PRICE[t]}` : esc(T("Needs level {n}", { n: TIERS[t].lv }))}</button></article>`; })).join("")}</div><p class="wr-note">${esc(T("Legendary gear only drops from hunting-ground bosses."))}</p>`;
    }
    return `<nav class="wa-tabs wr-ftabs">${tabs.map(([id, n]) => `<button type="button" data-ftab="${id}" aria-pressed="${id === forgeTab}">${esc(T(n))}</button>`).join("")}<span class="wa-bal"><img src="/images/arcl-64.png" alt="" width="24" height="24"><b>${Math.round(bal).toLocaleString("en-US")}</b></span></nav>${body}`;
  }
  function paint() {
    if (!open) return;
    el.innerHTML = `<div class="wr-card"><div class="wr-head"><span class="wr-ico">${view === "forge" ? '<svg viewBox="0 0 24 24"><path d="M3 9h13l5-3v4l-5 2H9v3l3 2H6l3-2v-3H3z"/></svg>' : iconSvg("armor", "#9fe6ff")}</span><div><h2>${esc(view === "forge" ? T("Forge") : T("Character"))}</h2><p>${esc(view === "forge" ? T("Gear and supplies for ARCL. Enhance with scrap.") : T("Your gear, your stats and your bag. I opens and closes it."))}</p></div>
      <nav class="wr-switch"><button type="button" data-view="inv" aria-pressed="${view === "inv"}">${esc(T("Character"))}</button><button type="button" data-view="forge" aria-pressed="${view === "forge"}">${esc(T("Forge"))}</button></nav>
      <button type="button" class="wa-x" data-x aria-label="${esc(T("Close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="wr-body">${view === "forge" ? forgeHTML() : invHTML()}</div></div>`;
  }
  function show(v) { view = v || view; open = true; el.hidden = false; ctx.freeze(true); if (view === "forge") ctx.arclRefresh().then(() => open && paint()); paint(); }
  function hide() { if (!open) return; open = false; el.hidden = true; sel = null; ctx.freeze(false); }
  function hammer() { const a = el.querySelector(".wr-detail"); if (a) { a.classList.remove("hit"); void a.offsetWidth; a.classList.add("hit"); } }
  async function buy(id) {
    const s = ctx.sess(); if (!s) { ctx.toast(T("Sign in with your wallet first")); return; }
    if (R().bag.length >= BAG && !FORGE_SUPPLY[id]) { ctx.toast(T("Your bag is full")); return; }
    const r = await ctx.post({ action: "world-forge-buy", ...s, item: id });
    if (!r.ok) { ctx.toast(r.j.error || T("Couldn't buy that")); ctx.Snd.bad && ctx.Snd.bad(); return; }
    if (r.j.supply) { const x = r.j.supply; R()[x.kind] = (R()[x.kind] || 0) + x.n; ctx.save(); ctx.toast(T("Bought: {x}", { x: T(FORGE_SUPPLY[id].name) })); }
    else { addItem(r.j.item, true); sel = r.j.item.id; ctx.toast(T("Bought: {x}", { x: itemName(r.j.item) })); }
    ctx.Snd.win && ctx.Snd.win(); ctx.arclRefresh().then(() => open && paint()); paint();
  }
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.closest("[data-x]")) { hide(); return; }
    const b = e.target.closest("button"); if (!b) return;
    const d = b.dataset;
    if (d.view) { view = d.view; sel = null; show(view); return; }
    if (d.ftab) { forgeTab = d.ftab; sel = null; paint(); return; }
    if (d.pick) { sel = sel === d.pick ? null : d.pick; paint(); return; }
    if (d.equip) { equip(d.equip); return; }
    if (d.unequip) { unequip(d.unequip); return; }
    if (d.enhance) { enhance(d.enhance); return; }
    if (d.salvage) { salvage(d.salvage); return; }
    if (b.hasAttribute("data-sort")) { sortBag(); return; }
    if (b.hasAttribute("data-junk")) { salvageCommons(); return; }
    if (b.hasAttribute("data-forge")) { view = "forge"; sel = null; show("forge"); return; }
    if (d.buy) buy(d.buy);
  });
  el.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape" || e.key.toLowerCase() === "i") hide(); });

  return {
    stats, addItem, rollDrop, usePotion, dress, show, hide, isOpen: () => open, itemName, iconSvg,
    potions: () => ({ hp: R().hp, sp: R().sp, recall: R().recall }), useRecall: () => { const r = R(); if (!(r.recall > 0)) return false; r.recall--; ctx.save(); return true; },
    onLevel: () => changed(), refresh: () => { cache = null; ctx.onStats(stats()); },
    data: () => R(),
  };
}
