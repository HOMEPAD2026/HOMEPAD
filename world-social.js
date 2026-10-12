// world-social.js — what ARCIRCLE World shares between players (the server side is api/_world-social.mjs):
//   the weekly raid boss   one arena south of town, one HP bar for everyone; your hits are reported every 5 seconds
//                          (capped by your level) and when it falls, everyone who helped claims a reward once
//   wanderers              other players' last spots in town, drawn as soft see-through figures (no names: the ping
//                          isn't signed)
//   cards and frames       an achievement card to share, and a branded frame for photos
const TAU = Math.PI * 2;
export const RAID = { id: "raid", name: "Raid Arena", x: 0, z: -122, r: 18, color: 0x39ff88, lv: [10, 99], ground: 0x12261c, boss: { name: "The Ponzi Leviathan", model: "Trilobite", scale: 2.0, y: 1.2, tint: 0x39ff88 } };
export const RAID_MIN_LV = 10;
// the same short tag the server gives a wanderer (api/_world-social.mjs tagOf), so the game can skip its own
export const tagOf = (id) => { let h = 2166136261; for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h.toString(36).padStart(7, "0").slice(-7); };

/// ctx: { THREE, K, planet, T, esc, toast, Snd, here(v), level(), sess(), post(b), combat, rpg, quests(), gain(n, why),
///        inHub(), wallet(), onArcl(n), feed(html, color), shareCard(o), name() }
export const PHASES = [null, "", "Phase 2: it calls its swarm", "Phase 3: its shield goes up", "Final phase: the floor gives way"];
// this week's twist on the raid: picked from the week's id, so everyone gets the same one (world-combat.js applies it)
export const RAID_MODS = [
  { id: "shield", name: "Iron shell", line: "Its shield comes up from phase 2, and more often." },
  { id: "swarm", name: "Swarm week", line: "A bigger swarm, back sooner." },
  { id: "rain", name: "Red rain", line: "In the final phase the red circles fall twice as fast." },
  { id: "slam", name: "Ground pound", line: "It slams the floor more often. Step out of the red circle." },
  { id: "rally", name: "Rally", line: "Your hits on the boss mend you a little." },
];
export const raidModOf = (week) => { let h = 2166136261; for (const ch of String(week || "")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return RAID_MODS[h % RAID_MODS.length]; };
export const phaseOf = (hp, max) => (hp <= 0 ? 5 : hp / max > 0.75 ? 1 : hp / max > 0.5 ? 2 : hp / max > 0.25 ? 3 : 4);
// the next Monday 00:00 in Seoul, for when the server's answer doesn't carry it (api/_world-social.mjs nextWeekAt)
const nextMonday = (t = Date.now()) => { const d = new Date(t + 9 * 3600e3), dow = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + (7 - dow) * 864e5 - 9 * 3600e3; };
const leftText = (ms, T) => { const m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60); return d ? T("{d}d {h}h", { d, h }) : T("{h}h {m}m", { h, m: m % 60 }); };
// a calendar file with a weekly reminder: Mondays at noon in Seoul, when the new raid boss has been up for twelve hours
export function raidIcs(t = Date.now(), title = "ARCIRCLE World: a new raid boss is up", text = "") {
  const at = new Date(nextMonday(t) + 12 * 3600e3), z = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s) => String(s).replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ARCIRCLE//World//EN", "BEGIN:VEVENT", `UID:arcircle-raid-weekly@arcircle.app`, `DTSTAMP:${z(new Date(t))}`, `DTSTART:${z(at)}`, `DTEND:${z(new Date(at.getTime() + 30 * 60e3))}`, "RRULE:FREQ=WEEKLY", `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(text)}`, "URL:https://www.arcircle.app/play", "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", `DESCRIPTION:${esc(title)}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}
function raidCalendar(T) {
  const ics = raidIcs(Date.now(), T("ARCIRCLE World: a new raid boss is up"), T("One boss, one HP bar for everyone. arcircle.app/play"));
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "arcircle-raid.ics"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export function createRaid(ctx) {
  const { THREE, K, planet, T, esc } = ctx;
  const root = new THREE.Group(); root.name = "raid"; root.position.set(RAID.x, 0, RAID.z); planet.add(root);
  // the arena: a dark green floor, a glowing rim, eight pillars with lights, a gate facing the town and its sign
  const glow = (c, k = 2) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(RAID.r, 72), new THREE.MeshStandardMaterial({ color: RAID.ground, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.03; floor.receiveShadow = true; root.add(floor);
  const rune = new THREE.Mesh(new THREE.RingGeometry(6, 6.3, 64), new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); rune.rotation.x = -Math.PI / 2; rune.position.y = 0.05; root.add(rune);
  // the floor's markings: rings, spokes and a band of ticks, drawn once on a canvas; they take the phase's colour
  const marks = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 1024; const g = cv.getContext("2d"), c = 512, R = 500;
    g.strokeStyle = "#fff"; g.lineCap = "round";
    [[0.93, 5], [0.86, 2], [0.62, 3], [0.36, 2], [0.18, 4]].forEach(([k, w]) => { g.lineWidth = w; g.globalAlpha = 0.55; g.beginPath(); g.arc(c, c, R * k, 0, TAU); g.stroke(); });
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r0 = R * (i % 2 ? 0.4 : 0.2), r1 = R * 0.84; g.lineWidth = i % 2 ? 2 : 4; g.globalAlpha = i % 2 ? 0.3 : 0.5; g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); g.stroke(); }
    for (let i = 0; i < 96; i++) { const a = (i / 96) * TAU, r0 = R * 0.865, r1 = R * (i % 4 ? 0.89 : 0.915); g.lineWidth = i % 4 ? 2 : 4; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); g.stroke(); }
    // eight diamonds between the spokes
    g.fillStyle = "#fff"; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + TAU / 32, x = c + Math.cos(a) * R * 0.74, y = c + Math.sin(a) * R * 0.74; g.globalAlpha = 0.45; g.beginPath(); g.moveTo(x, y - 16); g.lineTo(x + 11, y); g.lineTo(x, y + 16); g.lineTo(x - 11, y); g.closePath(); g.fill(); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.CircleGeometry(RAID.r * 0.98, 72), new THREE.MeshBasicMaterial({ map: tex, color: 0x39ff88, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.04; root.add(m); return m;
  })();
  // the floor gauge: a ring around the arena that runs down with everyone's HP bar
  const gaugeBg = new THREE.Mesh(new THREE.RingGeometry(15.4, 16.6, 96), new THREE.MeshBasicMaterial({ color: 0x0a1712, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); gaugeBg.rotation.x = -Math.PI / 2; gaugeBg.position.y = 0.045; root.add(gaugeBg);
  const gaugeMat = new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }); // above the floor, which is pulled forward itself
  let gauge = null, gaugeK = -1;
  function setGauge(k) {
    k = Math.max(0, Math.min(1, k)); if (Math.abs(k - gaugeK) < 0.004) return; gaugeK = k;
    if (gauge) { root.remove(gauge); gauge.geometry.dispose(); }
    if (k <= 0) { gauge = null; return; }
    gauge = new THREE.Mesh(new THREE.RingGeometry(15.5, 16.5, 96, 1, Math.PI / 2, -k * TAU), gaugeMat); gauge.rotation.x = -Math.PI / 2; gauge.position.y = 0.055; root.add(gauge);
    gaugeMat.color.set(k > 0.5 ? 0x39ff88 : k > 0.25 ? 0xffc861 : 0xff4d6d);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RAID.r, 0.16, 8, 128), glow(RAID.color, 1.8)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.1; root.add(rim);
  const pillars = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + Math.PI / 8;
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 6, 1.1), new THREE.MeshStandardMaterial({ color: 0x1a2a24, metalness: 0.5, roughness: 0.35, flatShading: true }));
    p.position.set(Math.cos(a) * (RAID.r + 1.4), 3, Math.sin(a) * (RAID.r + 1.4)); p.castShadow = true; root.add(p);
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), glow(RAID.color, 2.4)); cap.position.y = 3.8; p.add(cap); pillars.push(cap);
  }
  const toTown = Math.atan2(-RAID.x, -RAID.z);
  const gate = K.makeArch ? K.makeArch(RAID.color) : null;
  if (gate) { gate.scale.setScalar(1.5); gate.position.set(Math.sin(toTown) * RAID.r, 0, Math.cos(toTown) * RAID.r); gate.rotation.y = toTown; root.add(gate); }
  const sign = K.label(T("Weekly raid"), { accent: "#39ff88", size: 1.1, sub: T("Level {n}+ · one boss for everyone", { n: RAID_MIN_LV }) });
  sign.position.set(Math.sin(toTown) * RAID.r, 9, Math.cos(toTown) * RAID.r); root.add(sign);

  // the shared HP, the hits waiting to be reported, what others did in between
  let st = null, pending = 0, sendAt = 0, pollAt = 0, paintAt = 0, lastFetch = 0, warnedLv = false, warnedSign = false, sending = false, phase = 0, finaleT = 0;
  const me = new THREE.Vector3();
  const inside = () => { ctx.here(me); return Math.hypot(me.x - RAID.x, me.z - RAID.z) < RAID.r - 0.5; };
  const near = () => { ctx.here(me); return Math.hypot(me.x - RAID.x, me.z - RAID.z) < RAID.r + 30; };
  const SEEN = "arc.world.raidFell";
  async function load() {
    lastFetch = Date.now();
    try { const w = ctx.wallet(); const r = await fetch("/api/social?world=raid" + (w ? "&wallet=" + w : "")); if (r.ok) { const j = await r.json(); if (j && j.max) setState(j, 0); } } catch { /* next time */ }
  }
  function setState(j, counted) {
    const was = st; st = j;
    if (st.week && (!was || was.week !== st.week)) ctx.combat.raidMod && ctx.combat.raidMod(raidModOf(st.week).id);
    // the damage other raiders did since the last word from the server
    if (was && !was.down && was.week === st.week) { const others = Math.round(was.hp - st.hp - (counted || 0)); if (others > 0) othersChip(others); }
    if (st.down) {
      const live = ctx.combat.raidMob();
      if ((was && !was.down) || live) { if (live && near()) finale(); else if (live) ctx.combat.raidDown(); }
      // everyone hears about it once, wherever they are
      let seen = ""; try { seen = localStorage.getItem(SEEN) || ""; } catch { /* private */ }
      if (seen !== st.week && st.fellAt && Date.now() - st.fellAt < 3 * 864e5) {
        try { localStorage.setItem(SEEN, st.week); } catch { /* private */ }
        ctx.feed && ctx.feed(T("{x} fell this week! Raiders who dealt {n}+ damage can claim at the arena.", { x: `<b style="color:#9fffd0">${esc(RAID.boss.name)}</b>`, n: st.need }), "#39ff88");
      }
    } else {
      ctx.combat.raidSet(st.hp - pending);
      const p = phaseOf(st.hp - pending, st.max);
      if (phase && p > phase && inside()) phaseUp(p);
      phase = p; ctx.combat.raidPhase && ctx.combat.raidPhase(p);
    }
    setGauge(st.down ? 0 : (st.hp - pending) / st.max);
    paint();
  }
  // a new phase: a roar, a shake, the rim and the gauge change colour, a line across the screen
  function phaseUp(p) {
    ctx.Snd.siren && ctx.Snd.siren(); ctx.shake && ctx.shake(0.6);
    rim.material.color.set(p >= 4 ? 0xff4d6d : p >= 3 ? 0xffc861 : 0x39ff88); rim.material.emissive.copy(rim.material.color); marks.material.color.copy(rim.material.color);
    const c = document.createElement("div"); c.className = "wr-phase"; c.setAttribute("role", "status"); c.setAttribute("data-no-i18n", "");
    c.innerHTML = `<small>${esc(RAID.boss.name)}</small><b>${esc(T(PHASES[p]))}</b>`; document.body.appendChild(c); setTimeout(() => c.remove(), 2600);
  }
  // other raiders' damage, rising off the top bar
  function othersChip(n) {
    if (!inside()) return;
    const c = document.createElement("div"); c.className = "wr-others"; c.setAttribute("data-no-i18n", "");
    c.textContent = T("−{n} from other raiders", { n: n.toLocaleString("en-US") }); document.body.appendChild(c); setTimeout(() => c.remove(), 2400);
  }
  // it falls: confetti and coins over the arena, the raiders' names roll up the screen
  const confetti = [];
  function finale() {
    ctx.combat.raidDown(); finaleT = 6; ctx.clip && ctx.clip(6500); // the fall is filmed (the game's picture, not the panels) for a clip to save or share
    ctx.Snd.win && ctx.Snd.win(); ctx.shake && ctx.shake(0.8);
    const cols = [0x39ff88, 0xffc861, 0x4fa8ff, 0xff7ad9, 0xffffff];
    for (let i = 0; i < (ctx.reduce ? 24 : 140); i++) {
      const coin = i % 4 === 0, m = new THREE.Mesh(coin ? new THREE.CylinderGeometry(0.22, 0.22, 0.05, 14) : new THREE.PlaneGeometry(0.22, 0.34), new THREE.MeshBasicMaterial({ color: coin ? 0xffc861 : cols[i % cols.length], side: THREE.DoubleSide, transparent: true }));
      const a = Math.random() * TAU, d = Math.random() * RAID.r; m.position.set(Math.cos(a) * d, 12 + Math.random() * 10, Math.sin(a) * d); root.add(m);
      confetti.push({ m, v: 2 + Math.random() * 2.5, spin: (Math.random() - 0.5) * 8, sway: Math.random() * TAU });
    }
    const names = (st.top || []).map((r) => r.name || r.w), cr = document.createElement("div"); cr.className = "wr-credits"; cr.setAttribute("aria-hidden", "true"); cr.setAttribute("data-no-i18n", "");
    cr.innerHTML = `<div><small>${esc(T("Brought down together"))}</small><b>${esc(RAID.boss.name)}</b>${names.map((n, i) => `<p${i < 3 ? ' class="p' + (i + 1) + '"' : ""}>${esc(n)}</p>`).join("")}${st.players > names.length ? `<p class="more">${esc(T("and {n} more raiders", { n: st.players - names.length }))}</p>` : ""}</div>`;
    document.body.appendChild(cr); setTimeout(() => cr.remove(), 7000);
  }
  function tickConfetti(dt, t) {
    if (finaleT > 0) finaleT -= dt;
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i]; c.m.position.y -= c.v * dt; c.m.position.x += Math.sin(t * 2 + c.sway) * dt * 0.6; c.m.rotation.x += c.spin * dt; c.m.rotation.y += c.spin * 0.7 * dt;
      if (finaleT <= 1) c.m.material.opacity = Math.max(0, finaleT);
      if (c.m.position.y < 0.1 || finaleT <= 0) { root.remove(c.m); c.m.geometry.dispose(); confetti.splice(i, 1); }
    }
  }
  // a hit on the boss (world-combat.js): counted here and sent every few seconds
  function hit(n) {
    if (!st || st.down) return;
    pending += n; setGauge((st.hp - pending) / st.max);
    const p = phaseOf(st.hp - pending, st.max); if (p > phase && p < 5) { phaseUp(p); phase = p; ctx.combat.raidPhase && ctx.combat.raidPhase(p); }
    if (!ctx.sess() && !warnedSign) { warnedSign = true; ctx.toast(T("Sign in with your wallet so your raid hits count")); }
  }
  async function send() {
    if (sending || !pending || !ctx.sess()) return;
    const cap = 60 * ctx.level(), n = Math.min(pending, cap); pending = Math.min(cap, pending - n); // what's over the cap carries a little, not forever
    sending = true;
    // a report that didn't get through (offline, a server hiccup, too fast) goes back in the pile and rides with the next one
    const back = () => { pending = Math.min(cap * 3, pending + n); };
    try { const r = await ctx.post({ action: "world-raid-hit", ...ctx.sess(), dmg: Math.round(n) }); if (r.ok && r.j.max) setState(r.j, r.j.counted || 0); else if (!r.ok && (r.status >= 500 || r.status === 429 || !r.status)) back(); } catch { back(); }
    sending = false;
  }
  function spawn() {
    if (!st || st.down || ctx.combat.raidMob()) return;
    const lv = Math.max(12, Math.min(40, ctx.level()));
    ctx.combat.spawnRaid({ lv, boss: RAID.boss, zone: RAID, at: new THREE.Vector3(RAID.x, 0, RAID.z - 3), max: st.max, hp: st.hp - pending });
    ctx.combat.raidPhase && ctx.combat.raidPhase(phaseOf(st.hp - pending, st.max));
  }
  // the panel: the phase, your damage, the top three, others' share; when it's down, the claim and the countdown
  // (the HP itself is the bar at the top of the screen and the gauge on the floor)
  const el = document.createElement("div"); el.className = "wr-raid"; el.id = "wr-raid"; el.hidden = true; el.setAttribute("data-no-i18n", ""); document.body.appendChild(el);
  let claimedNow = false;
  function paint() {
    const show = !!st && ctx.inHub() && (inside() || (st.down && near()));
    el.hidden = !show; if (!show) return;
    const mine = st.mine + (st.down ? 0 : pending);
    const top = (st.top || []).slice(0, 3).map((r, i) => `<li><span>${i + 1}</span><b>${esc(r.name || r.w)}</b><em>${Math.round(r.n).toLocaleString("en-US")}</em></li>`).join("");
    const p = st.down ? 5 : phaseOf(st.hp - pending, st.max);
    el.innerHTML = `<div class="wr-raid-h"><b>${esc(RAID.boss.name)}</b><small>${esc(T("Weekly raid · {w}", { w: st.week }))}${st.players ? " · " + esc(T("{n} raiders", { n: st.players })) : ""}</small></div>
      ${st.down ? "" : (() => { const md = raidModOf(st.week); return `<p class="wr-raid-mod"><b>${esc(T("This week: {x}", { x: T(md.name) }))}</b> ${esc(T(md.line))}</p>`; })()}
      ${st.down ? `<p class="wr-raid-phase down">${esc(T("Down for this week"))} · ${esc(T("next in {t}", { t: leftText((st.next || nextMonday()) - Date.now(), T) }))}</p>` : `<p class="wr-raid-phase p${p}">${esc(p > 1 ? T(PHASES[p]) : T("Phase 1"))}</p>`}
      <p class="wr-raid-me">${esc(T("Your damage: {n}", { n: Math.round(mine).toLocaleString("en-US") }))}${mine < st.need ? ` <small>${esc(T("{n} to share the reward", { n: Math.max(0, Math.ceil(st.need - mine)).toLocaleString("en-US") }))}</small>` : ` <small class="ok">${esc(T("You're in for the reward"))}</small>`}</p>
      ${top ? `<ol class="wr-raid-top">${top}</ol>` : ""}
      <button type="button" class="wp-link wr-raid-cal" data-raidcal>${esc(T("Remind me every Monday (calendar)"))}</button>
      ${st.down ? (st.claimed ? `<p class="wr-raid-done">${esc(T("Reward claimed. A new raid boss comes on Monday."))}</p>${claimedNow || mine >= st.need ? `<button type="button" class="wp-btn wr-raid-share" data-raidshare>${esc(T("Share my raid card"))}</button>` : ""}` : `<button type="button" class="wp-cta wr-raid-claim" data-raidclaim ${ctx.sess() && st.mine >= st.need ? "" : "disabled"}>${esc(T("Claim the raid reward"))}</button><small class="wr-raid-what">${esc(T("An Epic piece of gear, 500 XP and {n} ARCL (once a week)", { n: st.arcl }))}</small>`) : ""}`;
  }
  el.addEventListener("click", async (e) => {
    if (e.target.closest("[data-raidcal]")) { raidCalendar(T); return; }
    if (e.target.closest("[data-raidshare]")) {
      const i = (st.top || []).findIndex((r) => ctx.name && r.name === ctx.name());
      ctx.shareCard && ctx.shareCard({ head: T("Weekly raid"), title: RAID.boss.name, line: T("My damage: {n}", { n: Math.round(st.mine).toLocaleString("en-US") }) + (i >= 0 ? " · " + T("#{n} this week", { n: i + 1 }) : ""), badge: T("Raid Breaker"), icon: "raid1" });
      return;
    }
    const b = e.target.closest("[data-raidclaim]"); if (!b || b.disabled) return;
    const s = ctx.sess(); if (!s) { ctx.toast(T("Sign in with your wallet first")); return; }
    b.disabled = true;
    const r = await ctx.post({ action: "world-raid-claim", ...s }).catch(() => ({ ok: false, j: {} }));
    if (!r.ok) { ctx.toast(r.j.error || T("Couldn't claim right now")); b.disabled = false; if (r.status === 409) load(); return; }
    st = { ...st, ...r.j }; claimedNow = true;
    const it = ctx.rpg.giftPiece(ctx.level(), 3); ctx.gain(500, T("Weekly raid"));
    const q = ctx.quests(); if (q) q.on.raid();
    if (r.j.credited) ctx.onArcl && ctx.onArcl(r.j.credited);
    ctx.Snd.win && ctx.Snd.win();
    ctx.toast(it ? T("Raid reward: {x}", { x: ctx.rpg.itemName(it) }) : T("Your bag is full — the raid gear became scrap"));
    paint();
  });
  // a little ahead of the arena: the next one's countdown for the map
  const nextText = () => (st && st.down ? T("next in {t}", { t: leftText((st.next || nextMonday()) - Date.now(), T) }) : st ? T("{p}% HP left", { p: Math.max(0, Math.round((100 * (st.hp - pending)) / st.max)) }) : "");

  return {
    zone: RAID, root, gate, hit, load, inside, nextText,
    state: () => st,
    tick(dt, t) {
      rune.rotation.z += dt * 0.15; rim.material.emissiveIntensity = 1.4 + Math.sin(t * 2) * 0.4; marks.rotation.z -= dt * 0.03; marks.material.opacity = 0.26 + Math.sin(t * 1.5) * 0.06;
      pillars.forEach((p, i) => { p.rotation.y = t * 1.2 + i; p.position.y = 3.8 + Math.sin(t * 2 + i) * 0.15; });
      if (gauge && gaugeK < 0.25) gaugeMat.opacity = 0.6 + Math.sin(t * 8) * 0.25;
      tickConfetti(dt, t);
      { ctx.here(me); const d = Math.hypot(me.x - sign.parent.position.x - sign.position.x, me.z - sign.parent.position.z - sign.position.z), k = Math.max(0, Math.min(1, (d - 6) / 6)); sign.material.opacity = k; sign.visible = k > 0.02; }
      if (!ctx.inHub()) { el.hidden = true; return; }
      const nr = near(), inn = nr && inside();
      // the HP comes from the server: every 10 s near the arena, every 2 minutes from anywhere else
      const now = Date.now(); // wall-clock timers: a slow frame rate mustn't slow the reports
      if (now >= pollAt) { pollAt = now + (nr ? 10e3 : 120e3); if (nr || now - lastFetch > 110e3) load(); }
      if (inn) {
        if (ctx.level() < RAID_MIN_LV) { if (!warnedLv) { warnedLv = true; ctx.toast(T("The raid is for level {n} and up. Come back stronger!", { n: RAID_MIN_LV })); } }
        else spawn();
      } else warnedLv = false;
      if (now >= sendAt) { sendAt = now + 5200; send(); }
      if (now >= paintAt) { paintAt = now + 500; paint(); }
    },
  };
}

/// the wanderers: soft see-through figures where other players were in the last two minutes
/// ctx: { THREE, K, planet, T, inHub(), myTag }
export function createGhosts(ctx) {
  const { THREE, K, planet } = ctx;
  const root = new THREE.Group(); root.name = "ghosts"; planet.add(root);
  const tints = { bot: 0x8fd6ff, male: 0x7fe0b0, female: 0xffa8d0, arc: 0x9ff3ff };
  const list = new Map(); // tag → { g, x, z, at, home }
  function figure(c, lv) {
    const g = new THREE.Group(), tint = tints[String(c).split("-")[0]] || tints.bot;
    const mat = new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.5, transparent: true, opacity: 0.45, depthWrite: false, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 10), mat); body.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), mat); head.position.y = 1.55;
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 28), new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.04;
    const tag = K.label(ctx.T("Lv {n}", { n: lv }), { accent: "#" + new THREE.Color(tint).getHexString(), size: 0.42 }); tag.position.y = 2.3; tag.material.opacity = 0.75; tag.userData.lvTag = true;
    g.add(body, head, halo, tag); g.userData = { body, head, mat };
    return g;
  }
  let pollAt = 0, palT = 0, palOn = false;
  const rings = [];
  // a ring of light where a wanderer appears (and again where one fades away)
  function arrive(g, out) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 32), new THREE.MeshBasicMaterial({ color: out ? 0xdfe7ef : 0x9fe6ff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    r.rotation.x = -Math.PI / 2; r.position.set(g.position.x, 0.06, g.position.z); root.add(r); rings.push({ r, t: 0 });
  }
  async function load() {
    try {
      const r = await fetch("/api/social?world=ghosts"); if (!r.ok) return;
      const now = Date.now(), seen = new Set();
      for (const x of (await r.json()).ghosts || []) {
        if (x.t === ctx.myTag || Math.hypot(x.x, x.z) > 150) continue; seen.add(x.t);
        let w = list.get(x.t);
        if (!w) { const g = figure(x.c, x.lv); g.position.set(x.x, 0, x.z); root.add(g); w = { g, x: x.x, z: x.z, at: now, wander: Math.random() * TAU, fade: 0 }; list.set(x.t, w); arrive(g); }
        w.x = x.x; w.z = x.z; w.at = now;
        // signed in (and not hidden): their name and level on the plate instead of just the level
        const nm = x.n ? `${x.n} · Lv ${x.l || x.lv}` : ""; w.wallet = x.w || ""; w.name = x.n || ""; w.lv = x.l || x.lv;
        if (nm && w.nm !== nm) { w.nm = nm; const tag = w.g.children.find((c) => c.isSprite && c.userData.lvTag); if (tag) { w.g.remove(tag); tag.material.map && tag.material.map.dispose(); } const t2 = K.label(x.n, { accent: "#9ff3ff", size: 0.42, sub: "Lv " + (x.l || x.lv) }); t2.position.y = 2.45; t2.material.opacity = 0.9; t2.userData.lvTag = true; w.g.add(t2); }
        // a friend from an invite link: a gold ring and a "Friend" plate
        const pal = !!(ctx.isPal && ctx.isPal(x)); if (pal && !w.pal) { w.pal = true; const pl = K.label(ctx.T("Friend"), { accent: "#ffc861", size: 0.42 }); pl.position.y = 2.75; w.g.add(pl); w.plate = pl; const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.78, 32), new THREE.MeshBasicMaterial({ color: 0xffc861, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; w.g.add(ring); }
        // a line they said in the last minute: a bubble over them, once
        if (x.sa && x.sa !== w.sa && ctx.sayText) { w.sa = x.sa; const txt = ctx.sayText(x.s); if (txt) { if (w.bub) w.g.remove(w.bub); const b = K.label(txt, { accent: "#9fffd0", size: 0.48 }); b.position.y = 3.2; w.g.add(b); w.bub = b; w.bubT = 6; } }
      }
      for (const [k, w] of list) if (!seen.has(k)) w.gone = true;
    } catch { /* next time */ }
  }
  const tmp = new THREE.Vector3();
  return {
    count: () => list.size,
    /// a friend's figure within r metres of you
    palNear: (r) => { const p = new THREE.Vector3(); ctx.here(p); for (const w of list.values()) if (w.pal && !w.gone && Math.hypot(p.x - w.g.position.x, p.z - w.g.position.z) < r) return true; return false; },
    each: (fn) => list.forEach((w) => fn(w.g, w)),
    /// the signed-in players around now: [{ name, lv, wallet }]
    named: () => [...list.values()].filter((w) => w.name && !w.gone).map((w) => ({ name: w.name, lv: w.lv, wallet: w.wallet, x: w.g.position.x, z: w.g.position.z })),
    tick(dt, t) {
      const on = ctx.inHub(); root.visible = on; if (!on) { if (palOn) { palOn = false; ctx.onPal && ctx.onPal(false); } return; }
      if ((palT -= dt) <= 0) { palT = 1; const n = this.palNear(20); if (n !== palOn) { palOn = n; ctx.onPal && ctx.onPal(n); } }
      for (let i = rings.length - 1; i >= 0; i--) { const o = rings[i]; o.t += dt; o.r.scale.setScalar(1 + o.t * 4); o.r.material.opacity = Math.max(0, 0.8 * (1 - o.t / 0.8)); if (o.t > 0.8) { root.remove(o.r); o.r.geometry.dispose(); rings.splice(i, 1); } }
      if (Date.now() >= pollAt) { pollAt = Date.now() + 20e3; load(); }
      for (const [k, w] of list) {
        // drift around the last spot, a little life in it
        w.wander += (Math.random() - 0.5) * dt * 0.8;
        const tx = w.x + Math.cos(w.wander) * 2.2, tz = w.z + Math.sin(w.wander) * 2.2;
        tmp.set(tx - w.g.position.x, 0, tz - w.g.position.z); const d = tmp.length();
        if (d > 25) w.g.position.set(w.x, 0, w.z); else if (d > 0.05) { tmp.multiplyScalar(Math.min(1, dt * 0.9 / d)); w.g.position.add(tmp); w.g.rotation.y = Math.atan2(tmp.x, tmp.z); }
        w.g.userData.body.position.y = 0.75 + Math.sin(t * 2 + w.wander) * 0.05; w.g.userData.head.position.y = 1.55 + Math.sin(t * 2 + w.wander) * 0.05;
        // walk up to one and it turns, hops and says hi (once in a while)
        if (ctx.here && !w.gone) { ctx.here(tmp); const dd = Math.hypot(tmp.x - w.g.position.x, tmp.z - w.g.position.z); if (dd < 3 && (!w.hiAt || performance.now() - w.hiAt > 20000)) { w.hiAt = performance.now(); w.hop = 1; w.g.rotation.y = Math.atan2(tmp.x - w.g.position.x, tmp.z - w.g.position.z); const hi = K.label(ctx.T("Hi!"), { accent: "#9fe6ff", size: 0.4 }); hi.position.y = 2.9; w.g.add(hi); setTimeout(() => { w.g.remove(hi); hi.material.map && hi.material.map.dispose(); }, 1800); } }
        if (w.bub && (w.bubT -= dt) <= 0) { w.g.remove(w.bub); w.bub = null; }
        if (w.hop > 0) { w.hop = Math.max(0, w.hop - dt * 1.6); w.g.position.y = Math.sin((1 - w.hop) * Math.PI) * 0.6; } else w.g.position.y = 0;
        w.fade = w.gone ? Math.max(0, w.fade - dt) : Math.min(1, w.fade + dt);
        w.g.userData.mat.opacity = 0.45 * w.fade;
        if (w.gone && w.fade <= 0) { arrive(w.g, true); root.remove(w.g); list.delete(k); }
      }
    },
  };
}

// ---------------- cards and frames (canvas, drawn in the game's own look) ----------------
const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
const font = (w, px) => `${w} ${px}px Sora, "Noto Sans KR", "Noto Sans SC", sans-serif`;
function rings(g, cx, cy, r, a = 0.16) {
  [["#2f86ff", 0], ["#2ee07a", 1], ["#35d8d0", 2]].forEach(([c, i]) => { g.strokeStyle = c; g.globalAlpha = a; g.lineWidth = 3; g.beginPath(); g.arc(cx + (i - 1) * r * 0.55, cy, r, 0, TAU); g.stroke(); });
  g.globalAlpha = 1;
}
function fitText(g, text, max, w, px, min = 18) { let s = px; g.font = font(w, s); while (s > min && g.measureText(text).width > max) { s -= 2; g.font = font(w, s); } return s; }

/// an achievement (or any) card: 1200 × 630 PNG
// a glyph for each achievement on its card (drawn around 0,0 at about ±60)
function glyph(g, icon) {
  g.fillStyle = "#1a1206"; g.strokeStyle = "#1a1206"; g.lineWidth = 9; g.lineCap = "round"; g.lineJoin = "round";
  const P = (pts, close) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath(); };
  if (/^k/.test(icon)) { P([[-38, 38], [30, -30]]); g.stroke(); P([[18, -42], [42, -18]]); g.stroke(); P([[-44, 24], [-24, 44]]); g.stroke(); }
  else if (icon === "e25") { P([[-34, 4], [0, -26], [34, 4]]); g.stroke(); P([[-34, 32], [0, 2], [34, 32]]); g.stroke(); }
  else if (/^b/.test(icon)) { P([[-40, 26], [-44, -20], [-20, 0], [0, -34], [20, 0], [44, -20], [40, 26]], true); g.fill(); }
  else if (icon === "leg") { for (const [x, y] of [[0, -20], [-20, 0], [20, 0], [0, 20]]) { g.beginPath(); g.arc(x, y, 17, 0, TAU); g.fill(); } }
  else if (icon === "zones") { g.beginPath(); g.arc(0, 0, 36, 0, TAU); g.stroke(); P([[0, -28], [10, 0], [0, 28], [-10, 0]], true); g.fill(); }
  else if (icon === "plus10") { P([[-30, 34], [14, -10]]); g.stroke(); g.fillRect(2, -40, 40, 22); }
  else if (icon === "raid1") { P([[0, -40], [34, -26], [30, 12], [0, 40], [-30, 12], [-34, -26]], true); g.fill(); g.strokeStyle = "#ffc861"; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.stroke(); }
  else if (icon === "quiz") { g.font = "900 72px Sora, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("?", 0, 4); }
  else { g.font = "900 64px Sora, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(icon || "").slice(0, 2).toUpperCase() || "★", 0, 4); }
}
export async function drawCard({ head, title, line, badge, name, lv, icon = "", foot = "arcircle.app/play", stats = null }) {
  const W = 1200, H = 630, cv = document.createElement("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d");
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, "#06121c"); bg.addColorStop(1, "#0a2a22"); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  rings(g, 930, 300, 230, 0.2);
  g.fillStyle = "rgba(57,255,136,.10)"; g.beginPath(); g.arc(930, 300, 150, 0, TAU); g.fill();
  const logo = await loadImg("/images/arcircle-mark-sm.png"); if (logo) g.drawImage(logo, 72, 64, 87, 51);
  g.fillStyle = "#9fb3c4"; g.font = font(700, 28); g.textBaseline = "alphabetic"; g.fillText("ARCIRCLE World", 176, 100);
  g.fillStyle = "#39ff88"; g.font = font(800, 30); g.fillText(head || "", 72, 222);
  g.fillStyle = "#eef3f7"; fitText(g, title || "", 720, 800, 76, 40); g.fillText(title || "", 72, 306);
  g.fillStyle = "#b8c6d2"; g.font = font(500, 30); g.fillText(line || "", 72, 360, 760);
  // a row of numbers (the season card): value over label, up to four
  if (stats && stats.length) {
    stats.slice(0, 4).forEach(([label, value], i) => { const x = 72 + i * 182; g.fillStyle = "rgba(255,255,255,.06)"; g.beginPath(); g.roundRect(x, 392, 168, 104, 16); g.fill(); g.fillStyle = "#eef3f7"; fitText(g, String(value), 140, 800, 40, 22); g.fillText(String(value), x + 18, 444); g.fillStyle = "#9fb3c4"; fitText(g, label, 140, 600, 20, 14); g.fillText(label, x + 18, 478); });
  } else if (badge) { g.font = font(800, 30); const w = g.measureText(badge).width + 56; g.fillStyle = "rgba(255,200,97,.14)"; g.strokeStyle = "#ffc861"; g.lineWidth = 2; g.beginPath(); g.roundRect(72, 400, w, 58, 29); g.fill(); g.stroke(); g.fillStyle = "#ffc861"; g.fillText(badge, 100, 440); }
  // the medal on the right
  g.save(); g.translate(930, 300);
  if (icon) { g.fillStyle = "#ffc861"; g.beginPath(); g.arc(0, 0, 104, 0, TAU); g.fill(); g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 92, 0, TAU); g.stroke(); glyph(g, icon); }
  else { g.fillStyle = "#ffc861"; g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 58 : 118, a = (i / 10) * TAU - Math.PI / 2; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }
  g.restore();
  g.fillStyle = "rgba(255,255,255,.08)"; g.fillRect(0, H - 92, W, 92);
  g.fillStyle = "#eef3f7"; g.font = font(700, 30); g.fillText((name || "") + (lv ? `  ·  Lv ${lv}` : ""), 72, H - 36);
  g.fillStyle = "#9fb3c4"; g.font = font(600, 26); g.textAlign = "right"; g.fillText(foot, W - 72, H - 36); g.textAlign = "left";
  return new Promise((ok) => cv.toBlob(ok, "image/png"));
}
/// a photo with the game's frame: a slim bar along the bottom with the mark, the name and the link
export const PHOTO_FILTERS = { none: "", warm: "sepia(.28) saturate(1.25) brightness(1.04)", cool: "hue-rotate(-12deg) saturate(1.15) contrast(1.05)", noir: "grayscale(1) contrast(1.25)", neon: "saturate(1.8) contrast(1.15) hue-rotate(8deg)" };
/// the photo: a filter, a sticker in the corner, and (unless frame is false) the bar along the bottom
export async function frameShot(blob, { name, lv, where, filter = "", sticker = "", frame = true } = {}) {
  const img = await loadImg(URL.createObjectURL(blob)); if (!img) return blob;
  const W = img.naturalWidth, H = img.naturalHeight, bar = frame ? Math.round(Math.max(64, H * 0.085)) : 0, cv = document.createElement("canvas"); cv.width = W; cv.height = H + bar;
  const g = cv.getContext("2d"); g.filter = PHOTO_FILTERS[filter] || "none"; g.drawImage(img, 0, 0); g.filter = "none";
  if (sticker) {
    const s = Math.round(Math.max(28, H * 0.045)); g.font = font(800, s); const tw = g.measureText(sticker).width, pad = s * 0.7, bw = tw + pad * 2, bh = s * 1.9, x = W - bw - s, y = s;
    g.save(); g.translate(x + bw / 2, y + bh / 2); g.rotate(-0.06); g.fillStyle = "rgba(6,18,28,.82)"; g.strokeStyle = "#ffc861"; g.lineWidth = Math.max(2, s * 0.09); g.beginPath(); g.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2); g.fill(); g.stroke();
    g.fillStyle = "#ffc861"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(sticker, 0, 2); g.restore();
  }
  if (!frame) return new Promise((ok) => cv.toBlob((b) => ok(b || blob), "image/png"));
  const bg = g.createLinearGradient(0, H, W, H + bar); bg.addColorStop(0, "#06121c"); bg.addColorStop(1, "#0a2a22"); g.fillStyle = bg; g.fillRect(0, H, W, bar);
  g.fillStyle = "#39ff88"; g.fillRect(0, H, W, Math.max(2, Math.round(bar * 0.04)));
  const logo = await loadImg("/images/arcircle-mark-sm.png"), lh = Math.round(bar * 0.46);
  let x = Math.round(bar * 0.4); if (logo) { g.drawImage(logo, x, H + (bar - lh) / 2, lh * 58 / 34, lh); x += lh * 58 / 34 + bar * 0.25; }
  g.textBaseline = "middle"; g.fillStyle = "#eef3f7"; g.font = font(800, Math.round(bar * 0.3)); g.fillText("ARCIRCLE World", x, H + bar / 2);
  x += g.measureText("ARCIRCLE World").width + bar * 0.35;
  g.fillStyle = "#9fb3c4"; g.font = font(600, Math.round(bar * 0.26)); const who = [name, lv ? "Lv " + lv : "", where].filter(Boolean).join("  ·  "); g.fillText(who, x, H + bar / 2, W * 0.45);
  g.textAlign = "right"; g.fillStyle = "#9fe6c8"; g.fillText("arcircle.app/play", W - bar * 0.4, H + bar / 2); g.textAlign = "left";
  return new Promise((ok) => cv.toBlob((b) => ok(b || blob), "image/png"));
}
