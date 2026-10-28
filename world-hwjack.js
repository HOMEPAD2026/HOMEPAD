// world-hwjack.js — HX2 (2026-10-28): by night the Inferno Pumpkin Throne's Inferno Jack is everyone's (api/_world-hwrealm.mjs
// NJACK): one HP each Cursed Night, the damage you deal sent every 5 s (the server caps it), his HP and the board read back
// every few seconds, the body a boss of the town's fights lent to it (world-combat.js spawnExt). When he falls the top three
// and everyone with a fair share are offered their fragments; at dawn he goes and the throne has its daytime Jack again.
import { HW } from "./world-hwrealm-data.js";
const NJ = HW.NJACK;
export function makeHwJack(ctx) {
  // ctx: { THREE, T, esc, post, sess, toast, combat(), kit(), K, here(v), level(), throne: { x, z, r, zone }, clock(), onView(v), onFell(v), cut(big, small, cls), laugh() }
  const { THREE } = ctx; let m = null, cycle = -1, pend = 0, sendT = 0, pollT = 0, view = null, polling = false, sending = false, offered = -1;
  const me = new THREE.Vector3();
  function body() { const e = ctx.K.enemy(ctx.kit(), "HwJack"); if (e) e.play("Idle"); return e; }
  function wake() {
    const c = ctx.combat(); if (m || !c || !c.spawnExt || (view && view.down)) return; const e = body(); if (!e) return; const th = ctx.throne;
    m = c.spawnExt({ ent: e, at: new THREE.Vector3(th.x, 0, th.z), lv: NJ.lv, max: NJ.hp, hp: view ? Math.max(1, view.hp) : NJ.hp, home: { x: th.x, z: th.z, r: th.r - 4 }, zone: th.zone, atkK: 1.2,
      extLabel: ctx.T("The Cursed Night · everyone's HP"), boss: { name: ctx.T("Inferno Jack"), scale: 2.8, y: 0, tint: 0xff5a1a },
      ext: { hit: (mm, dmg) => { pend += dmg; if (ctx.onStrike) ctx.onStrike(); }, down: () => fell() } });
    if (m) { ctx.burst && ctx.burst(m.g.position.clone(), false); ctx.laugh && ctx.laugh(); ctx.cut && ctx.cut(ctx.T("INFERNO JACK RISES"), ctx.T("Everyone's HP — the top 3 share his reward"), "night"); }
  }
  function gone() { const c = ctx.combat(); if (m && c && c.extGone) c.extGone(m); m = null; pend = 0; }
  function fell() { if (m && ctx.burst) ctx.burst(m.g.position.clone(), true); m = null; pend = 0; ctx.toast(ctx.esc(ctx.T("Inferno Jack fell! The top hitters share Pumpkin Soul Fragments."))); setTimeout(() => poll(true), 1200); }
  async function poll(force) {
    if (polling && !force) return; polling = true;
    try { const s = ctx.sess(), r = await fetch("/api/social?world=hw-jack" + (s ? "&wallet=" + s.wallet : ""), { cache: "no-store" }); if (r.ok) apply(await r.json()); } catch { /* the next time */ } finally { polling = false; }
  }
  function apply(v) {
    view = v; ctx.onView && ctx.onView(v); const c = ctx.combat();
    if (v.cycle !== cycle) { cycle = v.cycle; }
    if (m && c) { if (v.down) c.extDown(m); else c.extSet(m, Math.max(1, v.hp - pend)); }
    if (v.down && v.cycle !== offered && !v.claimed) { const s = ctx.sess(), mine = v.mine || 0, rank = (v.top || []).findIndex((x) => s && x.w === s.wallet.toLowerCase());
      if (s && (rank >= 0 && rank < 3 || mine >= NJ.hp * NJ.MIN_SHARE)) { offered = v.cycle; claim(v.cycle); } }
  }
  async function claim(cy) {
    const s = ctx.sess(); if (!s) return; const r = await ctx.post({ action: "world-hw-jack-claim", ...s, cycle: cy }); const j = r && r.j;
    if (j && j.ok && j.frag) ctx.onFell && ctx.onFell({ frag: j.frag, rank: j.rank, set: j.set, again: j.again });
  }
  async function send() {
    if (sending || pend < 1) return; const s = ctx.sess(); if (!s) { pend = 0; return; } if (ctx.level() < NJ.LV_MIN) { pend = 0; return; }
    sending = true; const d = Math.round(pend); pend = 0;
    try { const r = await ctx.post({ action: "world-hw-jack-hit", ...s, dmg: d }); if (r && r.status === 429) pend += d; else if (r && r.j && r.j.max) apply(r.j); } catch { pend += d; } finally { sending = false; }
  }
  return {
    tick(dt, on) {
      const clk = ctx.clock(), th = ctx.throne; ctx.here(me); const near = on && clk.night && Math.hypot(me.x - th.x, me.z - th.z) < th.r + 30;
      if (!on || !clk.night) { if (m) gone(); view = clk.night ? view : null; return; }
      if ((pollT -= dt) <= 0) { pollT = near ? 3 : 15; poll(); }
      if (near && !m && view && !view.down) wake(); if (!near && m) gone();
      if (m && (sendT -= dt) <= 0) { sendT = NJ.GAP + 0.2; send(); }
    },
    view: () => view, live: () => !!m, poll: () => poll(true),
  };
}
