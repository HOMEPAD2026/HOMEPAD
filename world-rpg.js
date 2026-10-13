// world-rpg.js — your character in ARCIRCLE World: stats that grow with your level, gear in seven slots, the bag, potions,
// the Forge (gear and supplies for ARCL, enhancing with scrap) and the gear you can see on your character.
//
// Saved with the rest of your progress (P.rpg → world-save, checked for shape in api/_world.mjs). Gear dropped by
// scammers turns into scrap, or sells back to the Forge through the server (by rarity, capped per day, each piece
// once); the Forge sells for ARCL through the server too.
import { SLOTS, SLOT_NAME, RARITY, TIERS, BASES, baseId, parseBase, itemStats, itemName, STAT_NAME, statsOf, FORGE_PRICE, FORGE_SUPPLY, forgeId, sellPrice, SELL_DAY_CAP, ARCL_DAY_CAP, mwBand, mwPrice, mwId, fuseResult, FUSE_MAX_R, FUSE_PICK_SCRAP, SKILL_INFO, BRANCHES, BRANCH_AT, skillLevel, bonusLine } from "./world-rpg-data.js";
export * from "./world-rpg-data.js";
import { WEAPON_KINDS, weaponKind, weapon as weapon3d, offBlade, weaponThumb, gearThumb, gearModel3d } from "./world-gear3d.js";
const RESHAPE = 40; // scrap to turn a weapon into another kind
// the bag: 24 slots, and 8 more for each "Bigger bag" bought with $ARCIRCLE (api/_world-shop.mjs bagSize), up to 120
const BAG_BASE = 24, BAG_STEP = 8, BAG_MAX = 120;
let BAG = BAG_BASE;
// storage: 48 more places for gear you're keeping, out of the bag (saved with your character)
const STORE = 48;
const isNewTab = (k) => { try { return !JSON.parse(localStorage.getItem("arc.world.newTabs") || "[]").includes(k); } catch { return false; } };
const seeTab = (k) => { try { const a = JSON.parse(localStorage.getItem("arc.world.newTabs") || "[]"); if (!a.includes(k)) { a.push(k); localStorage.setItem("arc.world.newTabs", JSON.stringify(a)); } } catch { /* private */ } };
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
  const LW = { ko: { Lock: "잠금", Unlock: "잠금 해제", Locked: "잠김", Cancel: "취소", power: "전투력", Wardrobe: "옷장", Slot: "부위", Skills: "스킬", Fuse: "합성", Worn: "착용 중",  Sell: "판매",  Weapon: "무기", Shield: "방패", Armor: "갑옷", Helmet: "투구", Ring: "반지", Boots: "신발", Necklace: "목걸이", Attack: "공격력", Defense: "방어력", Critical: "치명타", Speed: "이동속도", Common: "일반", Uncommon: "고급", Rare: "희귀", Epic: "영웅", Legendary: "전설", Equip: "장착", Unequip: "해제", Enhance: "강화", Salvage: "분해", Sort: "정렬", Character: "캐릭터", Bag: "가방", Scrap: "고철", Forge: "대장간", Supplies: "보급품", Buy: "구매", Level: "레벨", Sets: "세트", Gear: "장비", Accessories: "장신구" },
    zh: { Lock: "锁定", Unlock: "解锁", Locked: "已锁定", Cancel: "取消", power: "战力", Wardrobe: "衣橱", Slot: "部位", Skills: "技能", Fuse: "合成", Worn: "已穿戴",  Sell: "出售",  Weapon: "武器", Shield: "盾牌", Armor: "铠甲", Helmet: "头盔", Ring: "戒指", Boots: "靴子", Necklace: "项链", Attack: "攻击", Defense: "防御", Critical: "暴击", Speed: "移速", Common: "普通", Uncommon: "优秀", Rare: "稀有", Epic: "史诗", Legendary: "传说", Equip: "装备", Unequip: "卸下", Enhance: "强化", Salvage: "分解", Sort: "整理", Character: "角色", Bag: "背包", Scrap: "废料", Forge: "铁匠铺", Supplies: "补给", Buy: "购买", Level: "等级", Sets: "套装", Gear: "装备", Accessories: "饰品" } }[ctx.lang] || {};
  const T = (s, v) => (LW[s] != null ? LW[s] : ctx.T(s, v));
  const R = () => {
    if (!P.rpg || typeof P.rpg !== "object") P.rpg = {};
    const r = P.rpg; r.eq = r.eq || {}; r.bag = Array.isArray(r.bag) ? r.bag : []; r.store = Array.isArray(r.store) ? r.store : []; r.scrap = r.scrap || 0; r.hp = r.hp ?? 3; r.sp = r.sp ?? 2; r.recall = r.recall || 0;
    if (!r.starter) { r.starter = 1; r.eq.weapon = r.eq.weapon || { id: rid(), b: baseId("weapon", 0), r: 0, lv: 1, p: 0 }; r.eq.armor = r.eq.armor || { id: rid(), b: baseId("armor", 0), r: 0, lv: 1, p: 0 }; }
    return r;
  };
  R();
  let cache = null, bagAsk = 0, storeView = false; // bagAsk: 1 = asking to confirm a bigger bag, or a status line while it's paid for
  const stats = () => (cache = cache || statsOf(ctx.level(), R().eq, ctx.extraStats ? ctx.extraStats() : null));
  const changed = (why) => { cache = null; ctx.save(); ctx.onStats(stats()); if (open) paint(); dress(); if (why) ctx.toast(why); };

  // ---------------- items ----------------
  function addItem(it, quiet) {
    const r = R(); if (it && it.id) fresh.add(it.id); // marked new in the bag until you've seen it
    if (r.bag.length >= BAG) {
      // a full bag keeps the better piece: the weakest unlocked one goes to scrap instead, if the new one beats it
      const val = (x) => (x.r || 0) * 100 + (x.lv || 1) * 2 + (x.p || 0) * 10, weak = r.bag.filter((x) => !x.lk).sort((a, b) => val(a) - val(b))[0];
      if (weak && val(weak) < val(it)) {
        const s = scrapOf(weak); r.scrap += s; r.bag.splice(r.bag.indexOf(weak), 1); r.bag.push(it); changed();
        if (!quiet) ctx.toast(T("Bag full: kept {x}, {y} became {n} scrap", { x: itemName(it), y: itemName(weak), n: s })); return true;
      }
      const s = scrapOf(it); r.scrap += s; changed(); if (!quiet) ctx.toast(T("Bag full: {x} became {n} scrap", { x: itemName(it), n: s })); return false;
    }
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
    return { id: rid(), b: baseId(slot, tier), r, lv: Math.max(1, Math.min(100, lv)), p: 0 };
  }
  function equip(id) {
    const r = R(), i = r.bag.findIndex((x) => x.id === id); if (i < 0) return;
    const it = r.bag[i], p = parseBase(it.b); if (!p) return;
    if (TIERS[p.tier].lv > ctx.level()) { ctx.toast(T("Needs level {n}", { n: TIERS[p.tier].lv })); return; }
    r.bag.splice(i, 1); if (r.eq[p.slot]) r.bag.splice(i, 0, r.eq[p.slot]); r.eq[p.slot] = it;
    ctx.Snd.place && ctx.Snd.place(); changed();
  }
  // one number for how strong a set of stats is (for "Equip best": attack and defence weigh most, then health)
  const powerOf = (s) => (s.atk || 0) * 2 + (s.def || 0) * 1.6 + (s.hp || 0) * 0.3 + (s.sp || 0) * 0.08 + (s.crit || 0) * 3 + (s.spd || 0) * 1.2;
  // Equip best: for every slot, wear the piece from the bag that makes the character strongest (set bonuses count),
  // only pieces your level allows and never in place of a locked piece; a few passes so a set that only pays off
  // together still wins. planBest() works it out, the bag shows the plan, equipBest() puts it on.
  function planBest() {
    const r = R(), lv = ctx.level(), ex = ctx.extraStats ? ctx.extraStats() : null, eq = { ...r.eq };
    const s0 = statsOf(lv, eq, ex); let cur = powerOf(s0); const before = cur, put = new Set();
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const slot of SLOTS) {
        if (r.eq[slot] && r.eq[slot].lk) continue;
        let best = null, bp = cur;
        for (const it of r.bag) {
          const p = parseBase(it.b); if (!p || p.slot !== slot || TIERS[p.tier].lv > lv || put.has(it.id)) continue;
          const v = powerOf(statsOf(lv, { ...eq, [slot]: it }, ex)); if (v > bp + 0.01) { bp = v; best = it; }
        }
        if (best) { if (eq[slot]) put.delete(eq[slot].id); eq[slot] = best; put.add(best.id); cur = bp; moved = true; }
      }
      if (!moved) break;
    }
    const swaps = SLOTS.filter((sl) => eq[sl] && (!r.eq[sl] || r.eq[sl].id !== eq[sl].id));
    return { eq, swaps, gain: Math.round(cur - before), s0, s1: statsOf(lv, eq, ex) };
  }
  let plan = null;
  // gear sets: save what you wear as set 1 or 2, put a set on in one tap (pieces you've since sold are skipped)
  const sets = () => { const r = R(); r.x = r.x || {}; r.x.gs = Array.isArray(r.x.gs) ? r.x.gs : [null, null]; return r.x.gs; };
  function saveSet(n) { const r = R(), g = sets(); g[n] = Object.fromEntries(Object.entries(r.eq).filter(([, it]) => it).map(([k, it]) => [k, it.id])); ctx.save(); ctx.toast(T("Gear set {n} saved", { n: n + 1 })); paint(); }
  function wearSet(n) {
    const want = sets()[n]; if (!want) { ctx.toast(T("Save what you wear as set {n} first", { n: n + 1 })); return; }
    const r = R(); let moved = 0, gone = 0;
    for (const [slot, id] of Object.entries(want)) { if (r.eq[slot] && r.eq[slot].id === id) continue; const i = r.bag.findIndex((x) => x.id === id); if (i < 0) { gone++; continue; } const it = r.bag[i], p = parseBase(it.b); if (!p || TIERS[p.tier].lv > ctx.level()) continue; r.bag.splice(i, 1); if (r.eq[slot]) r.bag.splice(i, 0, r.eq[slot]); r.eq[slot] = it; moved++; }
    if (moved) { ctx.Snd.place && ctx.Snd.place(); changed(T("Gear set {n} on", { n: n + 1 }) + (gone ? " · " + T("{k} pieces are gone", { k: gone }) : "")); } else ctx.toast(gone ? T("{k} pieces are gone", { k: gone }) : T("You're already wearing set {n}", { n: n + 1 }));
  }
  function equipBest(now) {
    const pl = planBest();
    if (!pl.swaps.length) { plan = null; ctx.toast(T("You're already wearing your best gear")); if (open) paint(); return; }
    if (!now) { plan = pl; sel = null; if (open) paint(); return; } // first tap: show what changes
    const r = R();
    for (const sl of pl.swaps) {
      const it = pl.eq[sl], i = r.bag.findIndex((x) => x.id === it.id); if (i < 0) continue;
      r.bag.splice(i, 1); if (r.eq[sl]) r.bag.splice(i, 0, r.eq[sl]); r.eq[sl] = it;
    }
    plan = null; sel = null; ctx.Snd.place && ctx.Snd.place(); flash(pl.swaps);
    changed(T("Equipped {n} better pieces · power +{p}", { n: pl.swaps.length, p: pl.gain }));
  }
  function planHTML() {
    if (!plan) return "";
    const r = R(), keys = ["atk", "def", "hp", "sp", "crit", "spd"].filter((k) => (plan.s1[k] || 0) !== (plan.s0[k] || 0));
    return `<div class="wr-plan"><h4>${esc(T("Equip best"))} <b>+${plan.gain}</b> <small>${esc(T("power"))}</small></h4>
      <ul>${plan.swaps.map((sl) => `<li><span>${esc(T(SLOT_NAME[sl]))}</span><s>${r.eq[sl] ? esc(itemName(r.eq[sl])) : "—"}</s><b style="color:${rc(plan.eq[sl])}">${esc(itemName(plan.eq[sl]))}</b></li>`).join("")}</ul>
      <p>${keys.map((k) => { const d = Math.round(((plan.s1[k] || 0) - (plan.s0[k] || 0)) * 10) / 10; return `<em class="${d > 0 ? "up" : "down"}">${esc(T(STAT_NAME[k]))} ${d > 0 ? "+" : ""}${d}${k === "crit" || k === "spd" ? "%" : ""}</em>`; }).join("")}</p>
      <div class="wr-plan-acts"><button type="button" class="go" data-bestgo>${esc(T("Equip"))}</button><button type="button" data-bestno>${esc(T("Cancel"))}</button></div></div>`;
  }
  // the slots that just changed glow for a moment
  function flash(slots) {
    if (ctx.reduce) return;
    setTimeout(() => slots.forEach((sl) => { const c = el.querySelector(`[data-slot="${sl}"]`) || el.querySelector(`[data-unequip="${sl}"]`); if (c) { c.classList.remove("wr-flash"); void c.offsetWidth; c.classList.add("wr-flash"); } }), 30);
  }
  // a locked piece stays: no selling, salvaging or fusing it, and Equip best leaves it on
  // a weapon's kind (dual swords, hammer, blaster, bow, staff) can be changed for a little scrap; it keeps its stats
  function reshape(id, k) {
    const it = findItem(id), r = R(); if (!it || weaponKind(it) === k) return;
    if ((r.scrap || 0) < RESHAPE) { ctx.toast(T("Not enough scrap")); return; }
    r.scrap -= RESHAPE; it.k = k; changed(T("Now a {x}", { x: T(WEAPON_KINDS[k].name) }));
  }
  function lock(id) { const it = findItem(id); if (!it) return; it.lk = it.lk ? 0 : 1; if (!it.lk) delete it.lk; changed(it.lk ? T("Locked: {x}", { x: itemName(it) }) : T("Unlocked: {x}", { x: itemName(it) })); }
  function unequip(slot) { const r = R(); if (!r.eq[slot]) return; if (r.bag.length >= BAG) { ctx.toast(T("Your bag is full")); return; } r.bag.push(r.eq[slot]); delete r.eq[slot]; changed(); }
  function salvage(id) { const r = R(), i = r.bag.findIndex((x) => x.id === id); if (i < 0) return; if (r.bag[i].lk) { ctx.toast(T("Unlock it first")); return; } const s = scrapOf(r.bag[i]); r.scrap += s; r.bag.splice(i, 1); sel = null; changed(T("+{n} scrap", { n: s })); }
  function enhance(id) {
    const r = R(), it = r.bag.find((x) => x.id === id) || Object.values(r.eq).find((x) => x && x.id === id); if (!it) return;
    if ((it.p || 0) >= 10) { ctx.toast(T("Already +10")); return; }
    const c = enhanceCost(it); if (r.scrap < c) { ctx.toast(T("Needs {n} scrap", { n: c })); return; }
    r.scrap -= c; it.p = (it.p || 0) + 1; ctx.Snd.chest && ctx.Snd.chest(); hammer(); changed(T("{x} is now +{n}", { x: itemName({ ...it, p: 0 }), n: it.p })); ctx.onEnhance && ctx.onEnhance(it.p);
  }
  function sortBag() { const r = R(); r.bag.sort((a, b) => (b.r - a.r) || (b.lv - a.lv) || SLOTS.indexOf(parseBase(a.b).slot) - SLOTS.indexOf(parseBase(b.b).slot)); changed(); }
  function salvageCommons() { const r = R(); let s = 0; r.bag = r.bag.filter((x) => { if ((x.r || 0) === 0 && !(x.p > 0) && !x.lk) { s += scrapOf(x); return false; } return true; }); r.scrap += s; changed(s ? T("+{n} scrap", { n: s }) : T("No common gear to salvage")); }
  function usePotion(kind) {
    const r = R(); if (!(r[kind] > 0)) { ctx.toast(kind === "hp" ? T("No health potions: the Forge sells them") : T("No mana potions: the Forge sells them")); return false; }
    r[kind]--; ctx.save(); if (open) paint(); return true;
  }

  // ---------------- gear you can see ----------------
  // the Kenney characters have arm-left / arm-right / head bones: a blade in the right hand, a shield on the left
  // arm, a helmet on the head, a glow on the chest for armour; colours follow rarity
  let worn = [], wHand = null;
  // the weapon in hand moves with the attack, its own way (the arm's animation is shared by all kinds):
  // swords slash across, the hammer lifts high and slams, the blaster kicks back, the bow draws, the staff rises
  function swing(heavy) { if (wHand) { wHand.t = 0; wHand.heavy = !!heavy; if (trail) trail.n = 0; } }
  // the blade leaves a ribbon of light behind it (swords and the hammer): the last 16 places of its tip and its
  // middle, joined into a strip that fades from the newest end
  let trail = null;
  function makeTrail() {
    const THREE = ctx.THREE, N = 46, geo = new THREE.BufferGeometry(), idx = []; // 16 samples, smoothed three to a gap
    for (let i = 0; i < N - 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    geo.setIndex(idx); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 6), 3)); geo.setAttribute("a", new THREE.BufferAttribute(new Float32Array(N * 2), 1));
    const mat = new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color() }, uO: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: "attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform vec3 uC; uniform float uO; varying float vA; void main(){ gl_FragColor = vec4(uC * (0.6 + vA), vA * vA * uO); }" });
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.name = "blade-trail";
    return { mesh, N, S: 16, n: 0, tips: [], bases: [], fade: 0, a: new THREE.Vector3(), b: new THREE.Vector3(), st: [], sb: [] };
  }
  function tickTrail(dt, h) {
    if (!trail || !ctx.scene) return;
    const swinging = h && h.t < 1 && (h.kind === 0 || h.kind === 1 || h.kind === 4) && h.tip && !ctx.reduce;
    if (swinging) {
      if (!trail.mesh.parent) ctx.scene().add(trail.mesh);
      h.g.updateMatrixWorld(true);
      trail.tips.unshift(h.g.localToWorld(trail.a.copy(h.tip)).clone()); trail.bases.unshift(h.g.localToWorld(trail.b.copy(h.base)).clone());
      if (trail.tips.length > trail.S) { trail.tips.length = trail.S; trail.bases.length = trail.S; }
      trail.fade = 1; trail.mesh.material.uniforms.uC.value.set(h.kind === 1 || h.heavy ? 0xffc861 : h.color || 0x8fe6ff).multiplyScalar(1.4);
    } else trail.fade = Math.max(0, trail.fade - dt * 7);
    trail.mesh.visible = trail.fade > 0 && trail.tips.length > 1;
    if (!trail.mesh.visible) { if (trail.fade <= 0) { trail.tips.length = 0; trail.bases.length = 0; } return; }
    // a smooth arc through the samples (Catmull-Rom, three points between each pair), so a fast swing on a slow
    // frame still draws a curve and not a fan of straight cuts
    const cr = (out, P) => { out.length = 0; const n = P.length; for (let i = 0; i < n - 1; i++) { const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n - 1, i + 2)];
      for (let k = 0; k < 3; k++) { const t = k / 3, t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), z: f(p0.z, p1.z, p2.z, p3.z) }); } } if (n) out.push(P[n - 1]); return out; };
    const T = cr(trail.st, trail.tips), B = cr(trail.sb, trail.bases);
    const pos = trail.mesh.geometry.attributes.position, al = trail.mesh.geometry.attributes.a, L = Math.min(T.length, trail.N);
    for (let i = 0; i < trail.N; i++) { const j = Math.min(i, L - 1), t = T[j], b = B[j], k = i < L ? 1 - i / (L - 1 || 1) : 0; pos.setXYZ(2 * i, t.x, t.y, t.z); pos.setXYZ(2 * i + 1, b.x, b.y, b.z); al.setX(2 * i, k); al.setX(2 * i + 1, k * 0.15); }
    pos.needsUpdate = true; al.needsUpdate = true; trail.mesh.material.uniforms.uO.value = trail.fade * 0.85;
  }
  // an Epic or Legendary weapon gives off motes of its colour that drift up the blade (Legendary: more, brighter)
  function auraOf(h, color, legend) {
    const THREE = ctx.THREE, N = legend ? 22 : 12, a = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { a[i * 2] = Math.random(); a[i * 2 + 1] = Math.random() * 6.283; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3)); geo.setAttribute("aR", new THREE.BufferAttribute(a, 2));
    const mat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uB: { value: h.base.clone() }, uTip: { value: h.tip.clone() }, uC: { value: new THREE.Color(color) }, uS: { value: legend ? 34 : 24 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec2 aR; uniform float uT, uS; uniform vec3 uB, uTip; varying float vA;
        void main(){ float k = fract(aR.x + uT * 0.35); vec3 ax = uTip - uB; vec3 p = uB + ax * (k * 1.15 - 0.05);
          vec3 s1 = normalize(cross(ax, vec3(0.0, 0.0, 1.0)) + 1e-4), s2 = normalize(cross(ax, s1)); float r = 0.05 + 0.05 * sin(uT * 2.0 + aR.y);
          p += (s1 * cos(aR.y + uT * 3.0) + s2 * sin(aR.y + uT * 3.0)) * r; vA = sin(k * 3.14159);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = uS * (0.6 + 0.4 * vA) / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: "uniform vec3 uC; varying float vA; void main(){ vec2 q = gl_PointCoord * 2.0 - 1.0; float d = dot(q, q); if (d > 1.0) discard; gl_FragColor = vec4(uC * 1.6, (1.0 - d) * vA * 0.9); }" });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.name = "weapon-aura"; h.g.add(pts);
    return { pts, mat };
  }
  function tickSwing(dt) {
    const h = wHand; tickTrail(dt, h); if (h && h.aura) h.aura.mat.uniforms.uT.value += dt; if (!h || h.t >= 1) return;
    const dur = h.kind === 1 ? 0.5 : h.kind === 3 ? 0.55 : 0.28; h.t = Math.min(1, h.t + dt / dur);
    const k = h.t, up = Math.sin(Math.min(1, k * 1.4) * Math.PI), e = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
    const g = h.g; g.rotation.copy(h.r0); g.position.copy(h.p0);
    if (h.kind === 0) { g.rotation.z += (k < 0.4 ? -k / 0.4 : -1 + (k - 0.4) / 0.6 * 1.0) * 1.2; g.rotation.x += up * 0.5; }
    else if (h.kind === 1) { g.rotation.x += (k < 0.45 ? -(k / 0.45) * 2.2 : -2.2 + Math.min(1, (k - 0.45) / 0.15) * 3.0); }
    else if (h.kind === 2) { g.position.z -= e * 0.12; g.rotation.x -= e * 0.35; }
    else if (h.kind === 3) { g.position.z -= Math.sin(k * Math.PI) * 0.18; g.rotation.y += Math.sin(k * Math.PI) * 0.25; }
    else { g.position.y += up * 0.25; g.rotation.x -= up * 0.6; }
    if (k >= 1) { g.rotation.copy(h.r0); g.position.copy(h.p0); }
  }
  // where the blade ends: the point of the weapon farthest from the hand (and one a quarter of the way along)
  function bladeEnds(h) {
    const THREE = ctx.THREE, v = new THREE.Vector3(), inv = new THREE.Matrix4(); h.g.updateMatrixWorld(true); inv.copy(h.g.matrixWorld).invert();
    let best = 0, tip = null;
    h.g.traverse((o) => { if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return; const p = o.geometry.attributes.position, step = Math.max(1, Math.floor(p.count / 400)); const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(m); const d = v.lengthSq(); if (d > best) { best = d; tip = v.clone(); } } });
    if (tip) { h.tip = tip; h.base = tip.clone().multiplyScalar(0.3); }
  }
  function dress() {
    const av = ctx.avatar(); worn.forEach((m) => m.parent && m.parent.remove(m)); worn = [];
    if (!av || av.bot) return;
    const THREE = ctx.THREE, eq = R().eq;
    // where each piece sits: the Kenney characters' bones by default, or the body's own mount points (world-arcbots.js)
    const mo = av.mount || {}, at = (k, x, y, z) => (mo[k] ? new THREE.Vector3(...mo[k]) : new THREE.Vector3(x, y, z));
    const bone = (n) => { let b = null; av.obj.traverse((o) => { if (!b && o.name === n) b = o; }); return b; };
    const put = (b, mesh, pos, rot) => { if (!b) return; const ws = new THREE.Vector3(); b.getWorldScale(ws); const g = new THREE.Group(); g.scale.setScalar(1 / (ws.x || 1)); g.position.copy(pos).divideScalar(ws.x || 1); if (rot) g.rotation.set(...rot); g.add(mesh); b.add(g); worn.push(g); };
    const mat = (it, metal = 0.7) => { const c = new THREE.Color(RARITY[it.r || 0].color); return new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: 0.3, emissive: c, emissiveIntensity: (it.r || 0) >= 3 ? 0.6 : (it.r || 0) >= 2 ? 0.3 : 0.08 }); };
    // KayKit weapons and shields (world-decor.js) once their pack is in; the drawn ones until then
    const model = (slot, it) => { if (!ctx.gearModel) return null; const pb = parseBase(it.b); return pb ? ctx.gearModel(slot, pb.tier, RARITY[it.r || 0].color, (it.r || 0) >= 3 ? 0.35 : (it.r || 0) >= 2 ? 0.15 : 0) : null; };
    const glowOf = (it) => ((it.r || 0) >= 3 ? 0.35 : (it.r || 0) >= 2 ? 0.15 : 0) + (Number(it.tm) || 0) * 0.14, wpb = eq.weapon && parseBase(eq.weapon.b);
    const wm = wpb ? weapon3d(weaponKind(eq.weapon), wpb.tier, RARITY[eq.weapon.r || 0].color, glowOf(eq.weapon)) : null, sm = eq.shield && model("shield", eq.shield);
    // a little bigger than life: the characters are chibi, and a blaster or a bow at true size disappears in the hand
    const hold = (m) => { const hd = m.userData.hold; m.scale.multiplyScalar(m.name === "weapon:blaster" ? 1.6 : m.name === "weapon:bow" ? 1.45 : 1.2); if (hd === "down") { m.rotation.x = Math.PI; m.position.y = 0.06; } else if (hd === "up") m.position.y = 0.05; else { m.rotation.y = Math.PI; m.position.set(0, -0.05, -0.02); } return m; }; // the hand's +Z points behind you
    if (wm) { const w = new THREE.Group(); w.add(hold(wm)); put(bone("arm-right"), w, at("weapon", 0.02, -0.72, 0.12), [0.25, 0, 0]); wHand = { g: w, kind: weaponKind(eq.weapon), r0: w.rotation.clone(), p0: w.position.clone(), t: 1, color: new THREE.Color(RARITY[eq.weapon.r || 0].color).getHex() }; bladeEnds(wHand); if (!trail) trail = makeTrail(); if ((eq.weapon.r || 0) >= 3 && wHand.tip && !ctx.reduce) wHand.aura = auraOf(wHand, RARITY[eq.weapon.r].color, eq.weapon.r >= 4); } else wHand = null;
    // dual swords and no shield: the second blade in the other hand
    if (wm && weaponKind(eq.weapon) === 0 && !eq.shield) { const w = new THREE.Group(); w.add(hold(offBlade(wpb.tier, RARITY[eq.weapon.r || 0].color, glowOf(eq.weapon)))); put(bone("arm-left"), w, at("shield", -0.02, -0.72, 0.12), [0.25, 0, 0]); }
    if (sm) { const w = new THREE.Group(); sm.rotation.y = -Math.PI / 2; sm.position.y = -0.35; w.add(sm); put(bone("arm-left"), w, at("shield", -0.16, -0.5, 0.05)); }
    if (eq.weapon && !wm) { const g = new THREE.Group(); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.95, 0.18), mat(eq.weapon, 0.9)); blade.position.y = -0.62; const guard = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.38), new THREE.MeshStandardMaterial({ color: 0x3a2a1a, metalness: 0.5 })); guard.position.y = -0.12; const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0x2a1a10 })); grip.position.y = 0; g.add(blade, guard, grip); put(bone("arm-right"), g, at("weapon", 0.02, -0.72, 0.12), [0.25, 0, 0]); }
    if (eq.shield && !sm) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 6), mat(eq.shield, 0.6)); s.rotation.z = Math.PI / 2; const boss = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.9, roughness: 0.2 })); boss.position.x = -0.04; s.add(boss); put(bone("arm-left"), s, at("shield", -0.16, -0.5, 0.05)); }
    if (eq.helm) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(eq.helm, 0.7)); h.scale.set(1.08, 0.75, 1.08); const crest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.5), mat(eq.helm, 0.5)); crest.position.y = 0.4; h.add(crest); if (mo.helm) h.scale.multiplyScalar(1.25); put(bone("head"), h, at("helm", 0, 0.62, 0)); }
    if (eq.armor) { const a = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 32), mat(eq.armor, 0.6)); a.rotation.x = Math.PI / 2; if (mo.armorR) a.scale.setScalar(mo.armorR / 0.42); put(bone("torso"), a, at("armor", 0, 0.42, 0)); }
    if (eq.necklace) { const n = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), mat(eq.necklace, 0.3)); put(bone("torso"), n, at("necklace", 0, 0.55, 0.3)); }
  }

  // ---------------- the character sheet ----------------
  const el = document.createElement("div"); el.className = "wr-sheet"; el.id = "wr-inv"; el.hidden = true; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("data-no-i18n", "");
  document.body.appendChild(el);
  // the bag's filter (all / weapons / armour / accessories) and the pieces you haven't looked at yet
  const BAGF = { all: null, weapon: ["weapon"], armor: ["shield", "armor", "helm", "boots"], acc: ["ring", "necklace"] };
  let bagF = "all"; const fresh = new Set();
  let open = false, sel = null, view = "inv", forgeTab = "gear", log = null, fuseSel = [], fuseSlot = "", invPane = "gear";
  const rc = (it) => RARITY[it.r || 0].color;
  // a weapon shows its own 3D picture (its kind at a glance); the rest keep their icons
  const pic = (it) => { const p = parseBase(it.b); if (p) { const u = p.slot === "weapon" ? weaponThumb(weaponKind(it), p.tier, rc(it)) : gearThumb(p.slot, p.tier, rc(it)); if (u) return `<img class="wr-3d" src="${u}" alt="">`; } return iconSvg(p.slot, rc(it)); };
  const tile = (it, attrs = "") => it ? `<button type="button" class="wr-tile r${it.r || 0}${sel === it.id ? " sel" : ""}" ${attrs} style="--rc:${rc(it)}" title="${esc(itemName(it))}">${pic(it)}${it.p ? `<b>+${it.p}</b>` : ""}${it.tm ? `<em class="wr-tm" aria-label="${esc(T("Temper {n} of {m}", { n: it.tm, m: 5 }))}">${"✦".repeat(it.tm)}</em>` : ""}<small>${it.lv}</small>${it.lk ? `<i class="wr-lock" aria-label="${esc(T("Locked"))}"></i>` : ""}</button>` : "";
  const statLine = (k, v, d) => `<li><span>${esc(T(STAT_NAME[k]))}</span><b>${k === "crit" || k === "spd" ? v + "%" : v}</b>${d ? `<i class="${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${Math.abs(Math.round(d * 10) / 10)}</i>` : ""}</li>`;
  function detail(it) {
    if (!it) return `<div class="wr-detail empty"><p>${esc(T("Pick a piece of gear to see it here."))}</p></div>`;
    if (R().store.includes(it)) return `<div class="wr-detail" style="--rc:${rc(it)}"><div class="wr-d-h">${iconSvg(parseBase(it.b).slot, rc(it))}<div><h3>${esc(itemName(it))}</h3><small>${esc(T(RARITY[it.r || 0].name))} · ${esc(T("In storage"))}</small></div></div><div class="wr-acts"><button type="button" class="go" data-unstore="${it.id}">${esc(T("Take out"))}</button></div></div>`;
    const p = parseBase(it.b), on = R().eq[p.slot] && R().eq[p.slot].id === it.id, cur = R().eq[p.slot], g = itemStats(it), c = cur && !on ? itemStats(cur) : {};
    const keys = [...new Set([...Object.keys(g), ...Object.keys(c)])];
    const need = TIERS[p.tier].lv;
    return `<div class="wr-detail" style="--rc:${rc(it)}"><div class="wr-w3d" data-w3d="${esc(it.id)}"></div><div class="wr-d-h">${iconSvg(p.slot, rc(it))}<div><h3>${esc(itemName(it))}</h3><small>${esc(T(RARITY[it.r || 0].name))} · ${esc(T(SLOT_NAME[p.slot]))} · ${esc(T("Lv {n}", { n: it.lv }))}</small></div></div>
      <ul class="wr-stats">${keys.map((k) => statLine(k, g[k] || 0, on || !cur ? 0 : (g[k] || 0) - (c[k] || 0))).join("")}</ul>
      ${p.slot === "weapon" ? `<div class="wr-kind"><b>${esc(T(WEAPON_KINDS[weaponKind(it)].name))}</b><span>${esc(T(WEAPON_KINDS[weaponKind(it)].line))}</span>
        <div class="wr-kinds" role="group" aria-label="${esc(T("Weapon kind"))}">${WEAPON_KINDS.map((k, i) => `<button type="button" data-kind="${i}" aria-pressed="${weaponKind(it) === i}">${esc(T(k.name))}</button>`).join("")}</div>
        <small>${esc(T("Change kind: {n} scrap", { n: RESHAPE }))}</small>
        <p class="wr-temper"><span>${esc(T("Temper"))}</span><em>${Array.from({ length: 5 }, (_, i) => `<i class="${i < (it.tm || 0) ? "on" : ""}"></i>`).join("")}</em>${it.tm ? `<b>+${it.tm * 4}%</b>` : ""}${ctx.openCraft ? `<button type="button" data-tempergo>${esc(T("Workbench"))}</button>` : ""}</p></div>` : ""}
      <p class="wr-set">${esc(T("{x} set", { x: TIERS[p.tier].set }))}${need > ctx.level() ? ` · <span class="need">${esc(T("Needs level {n}", { n: need }))}</span>` : ""}</p>
      <div class="wr-acts">${on ? `<button type="button" data-unequip="${p.slot}">${esc(T("Unequip"))}</button>` : `<button type="button" class="go" data-equip="${it.id}" ${need > ctx.level() ? "disabled" : ""}>${esc(T("Equip"))}</button>`}
      <button type="button" data-enhance="${it.id}" ${(it.p || 0) >= 10 ? "disabled" : ""}>${esc(T("Enhance"))} <small>${(it.p || 0) >= 10 ? "MAX" : esc(T("{n} scrap", { n: enhanceCost(it) }))}</small></button>
      ${on ? "" : `<button type="button" data-store="${it.id}">${esc(T("To storage"))}</button>`}
      <button type="button" data-lock="${it.id}" aria-pressed="${!!it.lk}">${esc(it.lk ? T("Unlock") : T("Lock"))}</button>
      ${on ? "" : `<button type="button" class="sell" data-sell="${it.id}" ${it.lk || (view === "forge" && forgeTab === "sell" && sellGate().closed) ? "disabled" : ""}><img src="/images/arcl-64.png" alt="" width="16" height="16">${esc(view === "forge" && forgeTab === "sell" && sellGate().closed ? T("Sold out today") : T("Sell"))} <small>+${sellPrice(it)}</small></button><button type="button" class="warn" data-salvage="${it.id}" ${it.lk ? "disabled" : ""}>${esc(T("Salvage"))} <small>+${scrapOf(it)}</small></button>`}</div></div>`;
  }
  const findItem = (id) => R().bag.find((x) => x.id === id) || R().store.find((x) => x.id === id) || Object.values(R().eq).find((x) => x && x.id === id) || null;
  function invHTML() {
    const r = R(), s = stats();
    const slot = (k) => `<div class="wr-slot s-${k}" data-slot="${k}">${r.eq[k] ? tile(r.eq[k], `data-pick="${r.eq[k].id}"`) : `<span class="wr-empty-slot">${iconSvg(k, "rgba(222,233,244,.25)")}<small>${esc(T(SLOT_NAME[k]))}</small></span>`}</div>`;
    return `<nav class="wr-panes"><button type="button" data-pane="gear" aria-pressed="${invPane === "gear"}">${esc(T("Gear"))}</button><button type="button" data-pane="bag" aria-pressed="${invPane === "bag"}">${esc(T("Bag"))} <small>${r.bag.length}/${BAG}</small></button></nav><div class="wr-grid pane-${invPane}">
      <section class="wr-doll"><h3>${esc(T("Gear"))}<span class="wr-doll-acts">${ctx.sess() && ctx.openProfile ? `<button type="button" class="wr-wardrobe" data-mycard>${esc(T("My card"))}</button>` : ""}${ctx.isArc && ctx.isArc() ? `<button type="button" class="wr-wardrobe" data-wardrobe>${esc(T("Wardrobe"))}</button>` : ""}</span></h3><div class="wr-paper">${SLOTS.map(slot).join("")}<div class="wr-avatar"><span>${esc(T("Lv {n}", { n: ctx.level() }))}</span></div></div>
        <ul class="wr-stats big">${["atk", "def", "hp", "sp", "crit", "spd"].map((k) => statLine(k, s[k])).join("")}</ul>
        ${s.sets.length ? `<p class="wr-sets">${Object.entries(s.sets.reduce((m, x) => ((m[x.set] = Math.max(m[x.set] || 0, x.need)), m), {})).map(([set, need]) => esc(T("{x} set ({n})", { x: set, n: need }))).join(" · ")}</p>` : `<p class="wr-sets dim">${esc(T("Wear 2, 4 or 7 pieces of one set for a bonus."))}</p>`}${ctx.titleLine ? ctx.titleLine() : ""}${skillsHTML()}</section>
      <section class="wr-bag"><div class="wr-bag-h"><h3>${esc(T("Bag"))} <small>${r.bag.length}/${BAG}</small>${ctx.buyBag && BAG < BAG_MAX && !bagAsk ? ` <button type="button" class="wr-bagplus" data-bagplus>${esc(T("+{n} slots", { n: BAG_STEP }))}</button>` : ""}</h3><span class="wr-res"><b>${r.scrap}</b> ${esc(T("Scrap"))} · <b>${r.hp}</b> ${esc(T("health potions"))} · <b>${r.sp}</b> ${esc(T("mana potions"))}${r.recall > 0 ? ` · <button type="button" class="wr-recall" data-recall>${esc(T("Recall to the plaza ({n})", { n: r.recall }))}</button>` : ""}</span></div>
        ${bagAsk ? `<div class="wr-bagask" role="group"><p>${esc(bagAsk === 1 ? T("{n} more bag slots, for good, for 10,000 $ARCIRCLE from your wallet (half is burned, half goes to the treasury). Your bag: {a} → {b} slots.", { n: BAG_STEP, a: BAG, b: Math.min(BAG_MAX, BAG + BAG_STEP) }) : bagAsk)}</p>${bagAsk === 1 ? `<button type="button" class="go" data-bagbuy>${esc(T("Buy"))}</button><button type="button" data-bagno>${esc(T("Cancel"))}</button>` : `<button type="button" data-bagno>${esc(T("Close"))}</button>`}</div>` : ""}
        <nav class="wr-bagf" role="group" aria-label="${esc(T("Show"))}">${[["all", "All"], ["weapon", "Weapons"], ["armor", "Armour"], ["acc", "Accessories"]].map(([k, n]) => `<button type="button" data-bagf="${k}" aria-pressed="${bagF === k}">${esc(T(n))}</button>`).join("")}</nav>
        <div class="wr-store-t"><button type="button" data-storeview aria-pressed="${storeView}">${esc(storeView ? T("Back to the bag") : T("Storage {a}/{b}", { a: r.store.length, b: STORE }))}</button>${storeView ? `<small>${esc(T("Kept here, out of your bag. Pick a piece to take it out."))}</small>` : ""}</div>
        <div class="wr-cells${storeView ? " store" : ""}">${Array.from({ length: storeView ? STORE : BAG }, (_, i) => { const it = (storeView ? r.store : r.bag)[i], pb = it && parseBase(it.b), dim = it && BAGF[bagF] && !(pb && BAGF[bagF].includes(pb.slot)); return `<div class="wr-cell${dim ? " dim" : ""}${it && fresh.has(it.id) ? " new" : ""}">${it ? tile(it, `data-pick="${it.id}"`) : ""}</div>`; }).join("")}</div>
        <div class="wr-sets-b" role="group" aria-label="${esc(T("Gear sets"))}">${[0, 1].map((n) => `<span class="wr-gset${sets()[n] ? " on" : ""}"><button type="button" data-wearset="${n}">${esc(T("Set {n}", { n: n + 1 }))}</button><button type="button" class="sv" data-saveset="${n}" aria-label="${esc(T("Save what you wear as set {n}", { n: n + 1 }))}"><svg viewBox="0 0 24 24"><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/></svg></button></span>`).join("")}</div>
        <div class="wr-bag-f"><button type="button" class="go" data-best>${esc(T("Equip best"))}</button><button type="button" data-sort>${esc(T("Sort"))}</button><button type="button" data-junk>${esc(T("Salvage commons"))}</button><button type="button" data-craft>${esc(T("Workbench"))}</button><button type="button" class="gold" data-forge>${esc(T("Forge"))}</button></div>
        ${plan ? planHTML() : detail(sel && findItem(sel))}</section></div>`;
  }
  // ---------------- skills and their branches ----------------
  function skillsHTML() {
    const lv = ctx.level(), br = ((R().x || {}).br) || {};
    return `<div class="wr-skills"><h3>${esc(T("Skills"))}</h3><ul>${SKILL_INFO.map((k) => { const sl = skillLevel(lv, k.lv), opts = BRANCHES[k.id];
      if (!sl) return `<li class="off"><b>${esc(T(k.name))}</b><small>${esc(T("Level {n}", { n: k.lv }))}</small></li>`;
      const can = sl >= BRANCH_AT;
      return `<li class="sk-${k.id}"><b>${esc(T(k.name))} <span>${"★".repeat(sl)}</span></b>${can ? `<div class="wr-br">${opts.map((o) => `<button type="button" data-br="${k.id}:${o.id}" aria-pressed="${br[k.id] === o.id}" title="${esc(T(o.line))}"><i class="br-fx br-${k.id}-${o.id}" aria-hidden="true"><u></u><u></u><u></u></i><b>${esc(T(o.name))}</b><small>${esc(T(o.line))}</small></button>`).join("")}</div>` : `<small>${esc(T("Picks a branch at skill level 2 (level {n})", { n: k.lv + 5 }))}</small>`}</li>`; }).join("")}</ul></div>`;
  }
  function setBranch(v) {
    const [id, b] = String(v).split(":"); const k = SKILL_INFO.find((x) => x.id === id); if (!k || !BRANCHES[id] || skillLevel(ctx.level(), k.lv) < BRANCH_AT) return;
    const r = R(); r.x = r.x || {}; r.x.br = r.x.br || {}; r.x.br[id] = b; ctx.save(); paint();
    const o = BRANCHES[id].find((x) => x.id === b); ctx.toast(T("{x}: {y}", { x: T(k.name), y: T(o.name) })); ctx.Snd.pick && ctx.Snd.pick();
  }
  // ---------------- fusion: three of a rarity make one of the next ----------------
  function fuseHTML() {
    const bag = R().bag.filter((it) => (it.r || 0) <= FUSE_MAX_R), picked = fuseSel.map((id) => R().bag.find((x) => x.id === id)).filter(Boolean);
    const r0 = picked.length ? picked[0].r || 0 : -1, res = picked.length === 3 ? fuseResult(picked, 0) : null;
    const preview = res ? `<p class="wr-fuse-out" style="--rc:${RARITY[res.r].color}">${esc(T("Makes one {r} piece: one of these three slots, tier {t}, level {lv}", { r: T(RARITY[res.r].name), t: parseBase(res.b).tier + 1, lv: res.lv }))}</p>` : `<p class="wr-fuse-out dim">${esc(T("Pick three Common or three Uncommon pieces from your bag."))}</p>`;
    return `<p class="wr-note">${esc(T("Fusion: three pieces of the same rarity become one piece of the next rarity (Common → Uncommon → Rare). The three are used up."))}</p>
      <div class="wr-fuse-slots">${[0, 1, 2].map((i) => `<div class="wr-fslot">${picked[i] ? tile(picked[i], `data-fuse="${picked[i].id}"`) : `<span>${i + 1}</span>`}</div>`).join('<i aria-hidden="true">+</i>')}<i aria-hidden="true">=</i><div class="wr-fslot out${res ? " ready" : ""}" style="--rc:${res ? RARITY[res.r].color : "transparent"}">${res ? `<b>?</b>` : ""}</div></div>
      ${preview}${res ? `<div class="wr-fuse-pick"><span>${esc(T("Slot"))}</span><button type="button" data-fslot="" aria-pressed="${!fuseSlot}">${esc(T("Any (free)"))}</button>${[...new Set(picked.map((x) => parseBase(x.b).slot))].map((sl) => `<button type="button" data-fslot="${sl}" aria-pressed="${fuseSlot === sl}">${iconSvg(sl, "#cfe8ff")}${esc(T(SLOT_NAME[sl]))}</button>`).join("")}<small>${esc(T("Choosing costs {n} scrap", { n: FUSE_PICK_SCRAP }))}</small></div>` : ""}<button type="button" class="wr-fuse-go" data-fusego ${res ? "" : "disabled"}>${esc(T("Fuse"))}</button>
      <div class="wr-cells enh">${bag.map((it) => `<div class="wr-cell${fuseSel.includes(it.id) ? " on" : ""}${r0 >= 0 && (it.r || 0) !== r0 && !fuseSel.includes(it.id) ? " dim" : ""}">${tile(it, `data-fuse="${it.id}"`)}</div>`).join("") || `<p class="wa-empty">${esc(T("No Common or Uncommon pieces in your bag."))}</p>`}</div>`;
  }
  function fusePick(id) {
    const it = R().bag.find((x) => x.id === id); if (!it) return; if (it.lk && fuseSel.indexOf(id) < 0) { ctx.toast(T("Unlock it first")); return; }
    const at = fuseSel.indexOf(id); if (at >= 0) { fuseSel.splice(at, 1); paint(); return; }
    const first = fuseSel.length ? R().bag.find((x) => x.id === fuseSel[0]) : null;
    if (first && (first.r || 0) !== (it.r || 0)) { fuseSel = [id]; paint(); return; }
    if (fuseSel.length >= 3) fuseSel.shift(); fuseSel.push(id); paint();
  }
  function fuse() {
    const r = R(), picked = fuseSel.map((id) => r.bag.find((x) => x.id === id)).filter(Boolean);
    if (fuseSlot && (r.scrap || 0) < FUSE_PICK_SCRAP) { ctx.toast(T("Not enough scrap to choose the slot")); return; }
    const res = fuseResult(picked, Math.random(), fuseSlot); if (!res) return;
    if (fuseSlot) r.scrap -= FUSE_PICK_SCRAP; fuseSlot = "";
    r.bag = r.bag.filter((x) => !fuseSel.includes(x.id)); const it = { id: rid(), ...res }; r.bag.push(it); fuseSel = []; sel = it.id;
    ctx.Snd.win && ctx.Snd.win(); changed(T("Fused: {x}", { x: itemName(it) }));
    const out = el.querySelector(".wr-fslot.out"); if (out) { out.classList.remove("pop"); void out.offsetWidth; out.classList.add("pop"); }
    ctx.onFuse && ctx.onFuse(it);
  }
  // ---------------- the Forge ----------------
  // a buy button; anything from 5,000 ARCL asks once more before it's bought (the second tap buys)
  let askBuy = "";
  function buyBtn(id, price, ok, why) {
    if (!ok) return `<button type="button" class="wr-buy" disabled>${esc(why)}</button>`;
    const bal = ctx.arclBal(), short = bal < price;
    return `<button type="button" class="wr-buy${askBuy === id ? " ask" : ""}${short ? " short" : ""}" data-buy="${id}" data-price="${price}"><img src="/images/arcl-64.png" alt="" width="18" height="18">${askBuy === id ? esc(T("Buy for {n}?", { n: price.toLocaleString("en-US") })) : price.toLocaleString("en-US")}</button>`;
  }
  // the Masterwork bench: Arc-set pieces made at your level band, Epic or Legendary, plain, +5 or +10
  let mwR = 4, mwP = 0;
  function masterHTML(lv, bal) {
    const band = mwBand(lv), ok = lv >= 20;
    const pick = (k, v, label, on) => `<button type="button" data-mw="${k}:${v}" aria-pressed="${on}">${esc(label)}</button>`;
    return `<div class="wr-mwbar"><p>${esc(ok ? T("Made at level {n} (your level band). Each ten levels makes them stronger, and dearer.", { n: band }) : T("The Masterwork bench opens at level 20."))}</p>
      <div class="wr-mwpick" role="group" aria-label="${esc(T("Rarity"))}">${pick("r", 3, T("Epic"), mwR === 3)}${pick("r", 4, T("Legendary"), mwR === 4)}</div>
      <div class="wr-mwpick" role="group" aria-label="${esc(T("Enhancement"))}">${pick("p", 0, "+0", mwP === 0)}${pick("p", 5, "+5", mwP === 5)}${pick("p", 10, "+10", mwP === 10)}</div></div>
      <div class="wr-forge-grid">${SLOTS.map((sl) => { const it = { b: baseId(sl, 4), r: mwR, lv: band, p: mwP }, g = itemStats(it), price = mwPrice(band, mwR, mwP);
        return `<article class="wr-fcard mw${ok ? "" : " locked"}" style="--rc:${rc(it)}"><div class="wr-fart">${iconSvg(sl, rc(it))}</div><h4>${esc(BASES[sl][4])}${mwP ? ` +${mwP}` : ""}</h4><small>${esc(T(RARITY[mwR].name))} · ${esc(T("Lv {n}", { n: band }))}</small><p>${Object.entries(g).map(([k, v]) => `${esc(T(STAT_NAME[k]))} +${v}${k === "crit" || k === "spd" ? "%" : ""}`).join(" · ")}</p>${buyBtn(mwId(sl, mwR, mwP), price, ok, T("Needs level {n}", { n: 20 }))}</article>`; }).join("")}</div>
      <p class="wr-note">${esc(T("A weapon comes in the kind you're holding. Prices are in ARCL, earned by playing; ARCL can't be bought."))}</p>`;
  }
  // today's two selling limits, from the server: the Forge buys up to 1,500 ARCL of gear a day, and every ARCL you
  // earn shares the day's 30,000. When either is full, selling waits for midnight (Seoul time), and this says so.
  function sellGate() {
    const d = ctx.arclDay ? ctx.arclDay() : null;
    const sellCap = d ? d.sellCap : SELL_DAY_CAP, sold = d ? d.sold : SELL_DAY_CAP - sellLeft(), cap = d ? d.cap : ARCL_DAY_CAP, today = d ? d.today : 0;
    const sl = Math.max(0, sellCap - sold), el2 = Math.max(0, cap - today), closed = sl <= 0 || el2 <= 0;
    const ms = (() => { const n = new Date(Date.now() + 9 * 3600e3); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - 9 * 3600e3 - Date.now(); })();
    const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3), when = h ? T("{h} h {m} min", { h, m }) : T("{m} min", { m: Math.max(1, m) });
    const bar = (label, a, b) => `<div class="wr-sellcap"><span>${esc(label)}</span><b>${a.toLocaleString("en-US")} / ${b.toLocaleString("en-US")} ARCL</b><i><u style="width:${Math.min(100, (100 * a) / b)}%"></u></i></div>`;
    const why = sl <= 0 ? T("Today's {n} ARCL of sales is used.", { n: sellCap.toLocaleString("en-US") }) : T("Today's {n} ARCL is earned.", { n: cap.toLocaleString("en-US") });
    return { closed, why, when, html: `${closed ? `<div class="wr-sellshut" role="status"><b>${esc(T("Selling is closed until midnight (Seoul time)"))}</b><span>${esc(why)} ${esc(T("The Forge buys again in {t}. Pieces stay in your bag.", { t: when }))}</span></div>` : ""}${bar(T("Sales left today"), sl, sellCap)}${bar(T("ARCL earned today"), today, cap)}` };
  }
  function forgeHTML() {
    const lv = ctx.level(), bal = ctx.arclBal();
    const tabs = [["gear", "Gear"], ["acc", "Accessories"], ["master", "Masterwork"], ["supplies", "Supplies"], ["sell", "Sell"], ["enhance", "Enhance"], ["fuse", "Fuse"]];
    let body = "";
    if (forgeTab === "supplies") body = `<div class="wr-forge-grid">${Object.entries(FORGE_SUPPLY).map(([id, x]) => `<article class="wr-fcard"><div class="wr-fart sup-${x.kind}">${x.kind === "scrap" ? '<svg viewBox="0 0 24 24"><path d="M4 15l5-9 4 3 7-3-3 10-6 3z"/><path d="M9 6l1 8 7-5"/></svg>' : x.kind === "recall" ? '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M9 3h6M10 3v4L6 13a6 6 0 0 0 12 0l-4-6V3"/></svg>'}</div><h4>${esc(T(x.name))}</h4>${buyBtn(id, x.arcl, true, "")}</article>`).join("")}</div>`;
    else if (forgeTab === "sell") body = `${sellGate().html}<p class="wr-note">${esc(T("Sell gear from your bag for ARCL: the price goes by rarity and a little up with each +. Up to {n} ARCL of sales a day; worn gear isn't for sale.", { n: SELL_DAY_CAP.toLocaleString("en-US") }))}</p>${R().bag.length ? `<div class="wr-cells enh">${R().bag.map((it) => `<div class="wr-cell">${tile(it, `data-pick="${it.id}"`)}<span class="wr-price"><img src="/images/arcl-64.png" alt="" width="12" height="12">${sellPrice(it)}</span></div>`).join("")}</div>` : `<p class="wa-empty">${esc(T("Your bag is empty."))}</p>`}${detail(sel && R().bag.find((x) => x.id === sel))}`;
    else if (forgeTab === "fuse") body = fuseHTML();
    else if (forgeTab === "master") body = masterHTML(lv, bal);
    else if (forgeTab === "enhance") { const all = [...Object.values(R().eq).filter(Boolean), ...R().bag]; body = `<p class="wr-note">${esc(T("Enhancing always works: it costs scrap, which you get by salvaging gear. Each + adds 8% to the piece."))} <b>${R().scrap} ${esc(T("Scrap"))}</b></p><div class="wr-cells enh">${all.map((it) => `<div class="wr-cell">${tile(it, `data-pick="${it.id}"`)}</div>`).join("")}</div>${detail(sel && findItem(sel))}`; }
    else {
      const slots = forgeTab === "gear" ? ["weapon", "shield", "armor", "helm"] : ["ring", "boots", "necklace"];
      body = `<div class="wr-forge-grid">${slots.flatMap((sl) => [0, 1, 2, 3, 4].map((t) => { const it = { b: baseId(sl, t), r: t, lv: TIERS[t].lv, p: 0 }, g = itemStats(it), ok = lv >= TIERS[t].lv; return `<article class="wr-fcard${ok ? "" : " locked"}" style="--rc:${rc(it)}"><div class="wr-fart">${iconSvg(sl, rc(it))}</div><h4>${esc(BASES[sl][t])}</h4><small>${esc(T(RARITY[t].name))} · ${esc(T("Lv {n}", { n: TIERS[t].lv }))}</small><p>${Object.entries(g).map(([k, v]) => `${esc(T(STAT_NAME[k]))} +${v}${k === "crit" || k === "spd" ? "%" : ""}`).join(" · ")}</p>${buyBtn(forgeId(sl, t), FORGE_PRICE[t], ok, T("Needs level {n}", { n: TIERS[t].lv }))}</article>`; })).join("")}</div><p class="wr-note">${esc(T("The Arc set (Legendary) is forged from level 20. Stronger pieces made at your own level are on the Masterwork bench."))}</p>`;
    }
    return `<nav class="wa-tabs wr-ftabs">${tabs.map(([id, n]) => `<button type="button" data-ftab="${id}" aria-pressed="${id === forgeTab}">${esc(T(n))}${id === "fuse" && isNewTab("fuse") ? '<i class="nb">NEW</i>' : ""}</button>`).join("")}<span class="wa-bal"><img src="/images/arcl-64.png" alt="" width="24" height="24"><b>${Math.round(bal).toLocaleString("en-US")}</b></span></nav>${body}`;
  }
  function paint() {
    if (!open) return;
    el.innerHTML = `<div class="wr-card${opening ? " opening" : ""}"><div class="wr-head"><span class="wr-ico">${view === "log" ? '<svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/></svg>' : view === "forge" ? '<svg viewBox="0 0 24 24"><path d="M3 9h13l5-3v4l-5 2H9v3l3 2H6l3-2v-3H3z"/></svg>' : iconSvg("armor", "#9fe6ff")}</span><div><h2>${esc(view === "forge" ? T("Forge") : view === "log" ? T("Adventure log") : T("Character"))}</h2><p>${esc(view === "forge" ? T("Gear and supplies for ARCL. Enhance with scrap.") : view === "log" ? T("Daily hunts, the season, achievements, companions, the scam codex and top hunters. L opens it.") : T("Your gear, your stats and your bag. I opens and closes it."))}</p></div>
      <nav class="wr-switch"><button type="button" data-view="inv" aria-pressed="${view === "inv"}">${esc(T("Character"))}</button><button type="button" data-view="forge" aria-pressed="${view === "forge"}">${esc(T("Forge"))}</button>${log ? `<button type="button" data-view="log" aria-pressed="${view === "log"}">${esc(T("Adventure log"))}${log.pending() ? `<i class="wr-dot">${log.pending()}</i>` : ""}</button>` : ""}</nav>
      <button type="button" class="wa-x" data-x aria-label="${esc(T("Close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="wr-body">${view === "forge" ? forgeHTML() : view === "log" && log ? log.html() : invHTML()}</div></div>`;
    if (view === "inv") preview3d();
  }
  // the turning 3D view (world-preview.js): the selected weapon in its card, or else you, gear on, in the paper doll
  let PV = null;
  function preview3d() {
    const go = () => {
      if (!open || view !== "inv") return;
      const wd = el.querySelector("[data-w3d]"), it = wd && findItem(wd.dataset.w3d), pb = it && parseBase(it.b);
      if (it && pb) { const m = pb.slot === "weapon" ? weapon3d(weaponKind(it), pb.tier, RARITY[it.r || 0].color, ((it.r || 0) >= 3 ? 0.35 : (it.r || 0) >= 2 ? 0.15 : 0) + (Number(it.tm) || 0) * 0.14) : gearModel3d(pb.slot, pb.tier, RARITY[it.r || 0].color); PV.mount(wd, m, { kind: "item", own: true }); return; }
      const av = ctx.avatar(), slot = el.querySelector(".wr-avatar");
      if (av && !av.bot && slot) { slot.classList.add("has-3d"); PV.mount(slot, PV.figureOf(av.obj), { kind: "figure" }); }
    };
    if (PV) go(); else import("./world-preview.js").then((m) => { PV = m; go(); }).catch(() => {});
  }
  // the panel slides in when it opens, not again on every repaint (equipping, selling…)
  let opening = false;
  function show(v) { view = v || view; if (ctx.onView) ctx.onView(view); opening = !open; open = true; el.hidden = false; ctx.freeze(true); if (view === "forge") ctx.arclRefresh().then(() => open && paint()); paint(); opening = false; }
  function hide() { const tp = document.querySelector(".wr-tip"); if (tp) tp.hidden = true; if (!open) return; open = false; fresh.clear(); el.hidden = true; sel = null; ctx.freeze(false); if (PV) PV.stop(); }
  function hammer() { const a = el.querySelector(".wr-detail"); if (a) { a.classList.remove("hit"); void a.offsetWidth; a.classList.add("hit"); } }
  async function buy(id, price = 0) {
    const s = ctx.sess(); if (!s) { ctx.toast(T("Sign in with your wallet first")); return; }
    if (price > ctx.arclBal()) { ctx.toast(T("Not enough ARCL: you have {a}, it's {b}", { a: Math.floor(ctx.arclBal()).toLocaleString("en-US"), b: price.toLocaleString("en-US") })); return; }
    if (price >= 5000 && askBuy !== id) { askBuy = id; paint(); return; }
    askBuy = "";
    if (R().bag.length >= BAG && !FORGE_SUPPLY[id]) { ctx.toast(T("Your bag is full")); return; }
    const wk = R().eq.weapon ? weaponKind(R().eq.weapon) : null;
    const r = await ctx.post({ action: "world-forge-buy", ...s, item: id, ...(wk != null && /^(mw:weapon|weapon:4)/.test(id) ? { k: wk } : {}) });
    if (!r.ok) { ctx.toast(r.j.error || T("Couldn't buy that")); ctx.Snd.bad && ctx.Snd.bad(); return; }
    if (r.j.supply) { const x = r.j.supply; R()[x.kind] = (R()[x.kind] || 0) + x.n; ctx.save(); ctx.onPots && ctx.onPots(); ctx.toast(T("Bought: {x} · you have {n}", { x: T(FORGE_SUPPLY[id].name), n: R()[x.kind] })); }
    else { addItem(r.j.item, true); sel = r.j.item.id; ctx.toast(T("Bought: {x}", { x: itemName(r.j.item) })); }
    ctx.Snd.win && ctx.Snd.win(); ctx.arclRefresh().then(() => open && paint()); paint();
  }
  let selling = false;
  // what's left of today's 150 ARCL of sales (the server's word after each sale; a new day starts full)
  const sdKey = "arc.world.sold", sday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const sellLeft = () => { try { const v = JSON.parse(localStorage.getItem(sdKey) || "null"); return v && v.day === sday() ? v.left : SELL_DAY_CAP; } catch { return SELL_DAY_CAP; } };
  const setSellLeft = (n) => { try { localStorage.setItem(sdKey, JSON.stringify({ day: sday(), left: Math.max(0, n) })); } catch { /* private */ } };
  async function sellItem(id) {
    if (selling) return; const r = R(), it = r.bag.find((x) => x.id === id); if (!it) return; if (it.lk) { ctx.toast(T("Unlock it first")); return; }
    const s = ctx.sess(); if (!s) { ctx.toast(T("Sign in with your wallet first")); return; }
    selling = true;
    const sb = el.querySelector(`[data-sell="${id}"]`), sr = sb && sb.getBoundingClientRect(), from = sr ? { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 } : null;
    const res = await ctx.post({ action: "world-sell", ...s, item: { id: it.id, b: it.b, r: it.r, lv: it.lv, p: it.p || 0 } }).catch(() => ({ ok: false, j: {} }));
    selling = false;
    if (res.status === 409) {
      // the server has this piece as sold already: take it out of the bag so it stops failing
      const k = r.bag.findIndex((x) => x.id === id); if (k >= 0) r.bag.splice(k, 1); sel = null;
      changed(T("Already sold — taken out of your bag")); return;
    }
    if (!res.ok) { ctx.toast(res.j.error ? T(res.j.error) : T("Couldn't sell that")); ctx.Snd.bad && ctx.Snd.bad(); return; }
    if (res.j.left != null) setSellLeft(res.j.left); else if (res.j.capped) setSellLeft(0);
    if (res.j.capped && !res.j.credited) {
      ctx.Snd.bad && ctx.Snd.bad();
      ctx.toast(res.j.full === "earn" ? T("Today's ARCL is full ({n} a day). The piece stays in your bag: sell it tomorrow.", { n: ARCL_DAY_CAP.toLocaleString("en-US") })
        : T("That's today's {n} ARCL of sales — the Forge buys again tomorrow.", { n: SELL_DAY_CAP.toLocaleString("en-US") }));
      ctx.arclRefresh().then(() => open && paint()); return;
    }
    const i = r.bag.findIndex((x) => x.id === id); if (i >= 0) r.bag.splice(i, 1); sel = null;
    ctx.Snd.win && ctx.Snd.win(); changed(T("Sold: {x} · +{n} ARCL", { x: itemName(it), n: res.j.credited })); if (ctx.arclFly) ctx.arclFly(res.j.credited, from);
    ctx.arclRefresh().then(() => open && paint());
  }
  el.addEventListener("click", (e) => {
    if (e.target === el || e.target.closest("[data-x]")) { hide(); return; }
    const b = e.target.closest("button"); if (!b) return;
    const d = b.dataset;
    if (d.view) { view = d.view; sel = null; show(view); return; }
    if (view === "log" && log && log.click(b)) { paint(); return; }
    if (d.wearset != null) { wearSet(+d.wearset); return; }
    if (b.hasAttribute("data-storeview")) { storeView = !storeView; sel = null; paint(); return; }
    if (d.store) { const r = R(), i = r.bag.findIndex((x) => x.id === d.store); if (i < 0) return; if (r.store.length >= STORE) { ctx.toast(T("Storage is full ({n})", { n: STORE })); return; } r.store.push(r.bag.splice(i, 1)[0]); sel = null; changed(T("Put in storage")); return; }
    if (d.unstore) { const r = R(), i = r.store.findIndex((x) => x.id === d.unstore); if (i < 0) return; if (r.bag.length >= BAG) { ctx.toast(T("Your bag is full")); return; } r.bag.push(r.store.splice(i, 1)[0]); sel = null; changed(T("Taken out of storage")); return; }
    if (d.saveset != null) { saveSet(+d.saveset); return; }
    if (b.hasAttribute("data-bagplus")) { bagAsk = 1; paint(); return; }
    if (b.hasAttribute("data-bagno")) { bagAsk = 0; paint(); return; }
    if (b.hasAttribute("data-bagbuy")) {
      b.disabled = true; const status = (t) => { if (t) { bagAsk = t; paint(); } };
      ctx.buyBag(status).then((ok) => { bagAsk = ok ? 0 : bagAsk === 1 ? 0 : bagAsk; paint(); if (ok) ctx.toast(T("Your bag now has {n} slots", { n: BAG })); }).catch(() => { bagAsk = 0; paint(); });
      return;
    }
    if (b.hasAttribute("data-recall")) { if (ctx.recall && ctx.recall()) hide(); return; }
    if (d.ftab) { forgeTab = d.ftab; seeTab(forgeTab); sel = null; fuseSel = []; paint(); return; }
    if (e.target.closest("[data-tempergo]")) { const id = sel; hide(); ctx.openCraft("temper", id); return; }
    if (d.pane) { invPane = d.pane; paint(); return; }
    if (d.bagf) { bagF = d.bagf; paint(); return; }
    if (d.fuse) { fusePick(d.fuse); return; }
    if (d.fslot != null) { fuseSlot = d.fslot; paint(); return; }
    if (b.hasAttribute("data-fusego")) { const sl = el.querySelector(".wr-fuse-slots"); if (fuseSlot && (R().scrap || 0) < FUSE_PICK_SCRAP) { fuse(); return; } if (sl && !sl.classList.contains("fusing")) { sl.classList.add("fusing"); ctx.Snd.chest && ctx.Snd.chest(); setTimeout(fuse, 700); } else if (!sl) fuse(); return; }
    if (d.br) { setBranch(d.br); return; }
    if (d.pick) { plan = null; sel = sel === d.pick ? null : d.pick; if (sel && view === "inv") invPane = "bag"; paint(); return; }
    if (d.equip) { equip(d.equip); return; }
    if (d.unequip) { unequip(d.unequip); return; }
    if (d.enhance) { enhance(d.enhance); return; }
    if (d.salvage) { salvage(d.salvage); return; }
    if (d.sell) { sellItem(d.sell); return; }
    if (b.hasAttribute("data-wardrobe")) { if (ctx.openWardrobe) ctx.openWardrobe(); return; }
    if (b.hasAttribute("data-mycard")) { const s = ctx.sess(); if (s && ctx.openProfile) ctx.openProfile(String(s.wallet).toLowerCase()); return; }
    if (b.hasAttribute("data-craft")) { hide(); if (ctx.openCraft) ctx.openCraft(); return; }
    if (b.hasAttribute("data-best")) { equipBest(false); return; }
    if (b.hasAttribute("data-bestgo")) { equipBest(true); return; }
    if (b.hasAttribute("data-bestno")) { plan = null; paint(); return; }
    if (d.lock) { lock(d.lock); return; }
    if (d.kind != null && sel) { reshape(sel, +d.kind); return; }
    if (b.hasAttribute("data-sort")) { sortBag(); return; }
    if (b.hasAttribute("data-junk")) { salvageCommons(); return; }
    if (b.hasAttribute("data-forge")) { view = "forge"; sel = null; show("forge"); return; }
    if (d.mw) { const [k, v] = d.mw.split(":"); if (k === "r") mwR = +v; else mwP = +v; askBuy = ""; paint(); return; }
    if (d.buy) buy(d.buy, Number(d.price) || 0);
  });
  // a quick look: hover a piece (mouse) or hold it (touch) to compare it with what you wear
  const tip = document.createElement("div"); tip.className = "wr-tip"; tip.hidden = true; tip.setAttribute("role", "tooltip"); tip.setAttribute("data-no-i18n", ""); document.body.appendChild(tip);
  let tipT = 0;
  function showTip(b) {
    const it = findItem(b.dataset.pick); if (!it) return;
    const p = parseBase(it.b), cur = R().eq[p.slot], on = cur && cur.id === it.id, g = itemStats(it), c = cur && !on ? itemStats(cur) : {};
    const keys = [...new Set([...Object.keys(g), ...Object.keys(c)])];
    tip.style.setProperty("--rc", rc(it));
    tip.innerHTML = `<b>${esc(itemName(it))}</b><small>${esc(T(RARITY[it.r || 0].name))} · ${esc(T(SLOT_NAME[p.slot]))} · ${esc(T("Lv {n}", { n: it.lv }))}${on ? " · " + esc(T("Worn")) : ""}</small><ul class="wr-stats">${keys.map((k) => statLine(k, g[k] || 0, on || !cur ? 0 : (g[k] || 0) - (c[k] || 0))).join("")}</ul>${!on && cur ? `<em>${esc(T("vs. {x}", { x: itemName(cur) }))}</em>` : ""}`;
    tip.hidden = false;
    const r = b.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
    tip.style.top = (r.top - h - 10 > 8 ? r.top - h - 10 : r.bottom + 10) + "px";
  }
  const hideTip = () => { clearTimeout(tipT); tip.hidden = true; };
  el.addEventListener("pointerover", (e) => { const b = e.target.closest("[data-pick]"); if (b && e.pointerType === "mouse") showTip(b); });
  el.addEventListener("pointerout", (e) => { if (e.pointerType === "mouse" && e.target.closest("[data-pick]")) hideTip(); });
  el.addEventListener("pointerdown", (e) => { const b = e.target.closest("[data-pick]"); if (!b || e.pointerType === "mouse") return; clearTimeout(tipT); tipT = setTimeout(() => showTip(b), 380); });
  ["pointerup", "pointercancel", "scroll"].forEach((t) => el.addEventListener(t, (e) => { if (e.pointerType !== "mouse") hideTip(); }, true));
  el.addEventListener("keydown", (e) => { e.stopPropagation(); const k = e.key.toLowerCase(); if (e.key === "Escape" || (k === "i" && view !== "log") || (k === "l" && view === "log")) hide(); });

  return {
    stats, swing, tickSwing, addItem, equipBest: () => equipBest(true), planBest, rollDrop, usePotion, dress, show, hide, isOpen: () => open, itemName, iconSvg, thumb: (it) => pic(it),
    potions: () => ({ hp: R().hp, sp: R().sp, recall: R().recall }), useRecall: () => { const r = R(); if (!(r.recall > 0)) return false; r.recall--; ctx.save(); return true; },
    /// "Bigger bag" purchases (worldOwn.bag): the bag's size follows them
    setBagPlus: (n) => { const b = Math.min(BAG_MAX, BAG_BASE + BAG_STEP * Math.max(0, Math.floor(Number(n) || 0))); if (b !== BAG) { BAG = b; if (open) paint(); } }, bagSize: () => BAG,
    onLevel: () => changed(), refresh: () => { cache = null; ctx.onStats(stats()); },
    data: () => R(),
    setSkill: (id) => { R().sk = id; ctx.save(); },
    // the 7th day's chest: a Rare (or, one time in four, an Epic) piece at your level
    giftPiece: (lv, rr) => { const slot = SLOTS[Math.floor(Math.random() * SLOTS.length)], tier = Math.max(0, Math.min(4, TIERS.filter((t) => t.lv <= lv).length - 1)); const it = { id: rid(), b: baseId(slot, tier), r: rr != null ? rr : Math.random() < 0.25 ? 3 : 2, lv: Math.max(1, Math.min(60, lv)), p: 0 }; return addItem(it, true) ? it : null; },
    setLog: (q) => { log = q; }, forgeTab: (t) => { forgeTab = t; seeTab(t); }, repaint: () => paint(), view: () => view,
  };
}
