// world-quests.js — the Adventure log: daily hunts, achievements and the titles they give, the scammer codex (what
// each scam really is), this week's top hunters, and a companion drone that comes with the first achievement.
// Everything here pays XP, scrap and potions — never ARCL — so nothing in it can be farmed into tokens.
// Saved inside the character (P.rpg.x), so it travels with world-save.
const seoulDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };

// daily hunts: three a day, the same three for everyone
const DAILY = [
  { id: "kill10", name: "Knock out 10 scammers", ev: "kill", n: 10, xp: 60, scrap: 30 },
  { id: "kill25", name: "Knock out 25 scammers", ev: "kill", n: 25, xp: 120, scrap: 60 },
  { id: "elite3", name: "Knock out 3 elites", ev: "elite", n: 3, xp: 120, scrap: 50 },
  { id: "boss1", name: "Beat a hunting-ground boss", ev: "boss", n: 1, xp: 250, scrap: 120 },
  { id: "loot5", name: "Pick up 5 pieces of gear", ev: "loot", n: 5, xp: 80, scrap: 40 },
  { id: "rare1", name: "Find a Rare or better", ev: "rare", n: 1, xp: 100, scrap: 50 },
  { id: "skill15", name: "Cast 15 skills", ev: "skill", n: 15, xp: 70, scrap: 30 },
  { id: "zones2", name: "Hunt in 2 different grounds", ev: "zone", n: 2, xp: 90, scrap: 40 },
];
// achievements: each one gives a title to wear under your name
export const ACH = [
  { id: "k10", name: "First blood", line: "Knock out 10 scammers", ev: "kill", n: 10, title: "Scam Hunter" },
  { id: "k100", name: "On the hunt", line: "Knock out 100 scammers", ev: "kill", n: 100, title: "Phish Hunter" },
  { id: "k1000", name: "Clean streets", line: "Knock out 1,000 scammers", ev: "kill", n: 1000, title: "Rug Slayer" },
  { id: "e25", name: "Elite work", line: "Knock out 25 elites", ev: "elite", n: 25, title: "Elite Breaker" },
  { id: "b1", name: "Boss down", line: "Beat a boss", ev: "boss", n: 1, title: "Boss Breaker" },
  { id: "b10", name: "Boss season", line: "Beat 10 bosses", ev: "boss", n: 10, title: "Dragon Tamer" },
  { id: "leg", name: "Lucky find", line: "Find a Legendary", ev: "legendary", n: 1, title: "Lucky" },
  { id: "zones", name: "Explorer", line: "Hunt in all five grounds", ev: "zoneSet", n: 5, title: "Explorer" },
  { id: "plus10", name: "Master smith", line: "Enhance a piece to +10", ev: "plus10", n: 1, title: "Master Smith" },
  { id: "lv20", name: "Legend", line: "Reach level 20", ev: "level", n: 20, title: "Legend" },
];
// the codex: every scammer here stands for a real scam
export const CODEX = [
  { id: "spam", name: "Spam Bot", line: "Floods replies and DMs with fake giveaways and links. Real projects don't DM you first, and never ask you to \"verify\" a wallet." },
  { id: "drop", name: "Fake Airdrop", line: "A \"free\" token or NFT that asks you to approve a contract or sign a message to claim it. The approval lets it drain your wallet." },
  { id: "rug", name: "Rug Gremlin", line: "A coin whose team can pull the liquidity or mint more at will. Check locks, ownership and holders in the Scanner before you buy." },
  { id: "boss-spam", name: "The Spam King", line: "Impersonates support: a fake help account that asks for your recovery phrase. Nobody real will ever ask for it." },
  { id: "boss-fields", name: "The Free Mint", line: "A mint page cloned from a real project, with a malicious contract behind the button. Only mint from links the project posts itself." },
  { id: "boss-swamp", name: "The Honeypot Queen", line: "A token you can buy but can't sell: the contract blocks sells for everyone but the owner. The Scanner's sell simulation catches it." },
  { id: "boss-canyon", name: "The Rug Titan", line: "A big launch with unlocked liquidity and a team wallet holding most of the supply. When it dumps, the price goes to zero." },
  { id: "boss-depths", name: "The Rug Dragon", line: "The long con: months of hype, then the treasury and liquidity vanish together. Check where the money sits and who can move it." },
];
export const QUEST_ZONES = ["spam", "fields", "swamp", "canyon", "depths"];

/// ctx: { T, lang, esc, toast, P, save(), level(), gain(xp, why), rpg (for scrap and potions), Snd, wallet() }
export function createQuests(ctx) {
  const { esc } = ctx;
  const LW = { ko: { Daily: "일일", Achievements: "업적", Codex: "도감", Rankings: "순위", Claim: "받기", Wear: "착용", Worn: "착용 중", Explorer: "탐험가", Legend: "전설", Lucky: "행운아", Done: "완료", Locked: "잠김", scrap: "고철", title: "칭호" }, zh: { Daily: "每日", Achievements: "成就", Codex: "图鉴", Rankings: "排行", Claim: "领取", Wear: "佩戴", Worn: "佩戴中", Explorer: "探险家", Legend: "传奇", Lucky: "幸运儿", Done: "完成", Locked: "未解锁", scrap: "废料", title: "称号" } }[ctx.lang] || {};
  const T = (s, v) => (LW[s] != null ? LW[s] : ctx.T(s, v));
  const X = () => {
    const r = ctx.rpg.data(); r.x = r.x || {};
    const x = r.x; x.c = x.c || {}; x.ach = x.ach || []; x.seen = x.seen || {}; x.zones = x.zones || [];
    if (!x.d || x.d.day !== seoulDay()) x.d = { day: seoulDay(), p: {}, done: [], zones: [] };
    return x;
  };
  const todays = () => { const h = hash(seoulDay()); const pick = []; for (let i = 0; pick.length < 3 && i < 30; i++) { const q = DAILY[(h >> (i * 3)) % DAILY.length]; if (!pick.includes(q)) pick.push(q); } return pick; };
  let tab = "daily", top = null;

  function bump(ev, n = 1) {
    const x = X(); x.c[ev] = (x.c[ev] || 0) + n;
    for (const q of todays()) if (q.ev === ev && !x.d.done.includes(q.id)) { x.d.p[q.id] = (x.d.p[q.id] || 0) + n; if (x.d.p[q.id] >= q.n && !x.d.notified?.includes(q.id)) { x.d.notified = [...(x.d.notified || []), q.id]; ctx.toast(T("Daily hunt done: {x}. Claim it in the Adventure log.", { x: T(q.name) })); } }
    checkAch(); ctx.save();
  }
  function checkAch() {
    const x = X(), lv = ctx.level();
    for (const a of ACH) {
      if (x.ach.includes(a.id)) continue;
      const have = a.ev === "level" ? lv : a.ev === "zoneSet" ? x.zones.length : x.c[a.ev] || 0;
      if (have >= a.n) { x.ach.push(a.id); ctx.Snd.win && ctx.Snd.win(); ctx.toast(T("Achievement: {x} — new title \"{t}\"", { x: T(a.name), t: T(a.title) })); if (a.id === "k10") ctx.toast(T("A companion drone joins you!")); ctx.onAch && ctx.onAch(a); }
    }
  }
  function claim(id) {
    const x = X(), q = todays().find((y) => y.id === id); if (!q || x.d.done.includes(id) || (x.d.p[id] || 0) < q.n) return;
    x.d.done.push(id); const r = ctx.rpg.data(); r.scrap = (r.scrap || 0) + q.scrap; r.hp = Math.min(99, (r.hp || 0) + 1);
    ctx.save(); ctx.gain(q.xp, T(q.name)); ctx.toast(T("+{n} scrap · +1 health potion", { n: q.scrap }));
  }

  // events from the fight (world-combat.js) and the rest of the game
  const on = {
    kill: (k) => { const x = X(); bump("kill"); if (k.rank === "elite") bump("elite"); if (k.rank === "boss") bump("boss"); x.seen[k.rank === "boss" ? "boss-" + k.zone : k.type] = (x.seen[k.rank === "boss" ? "boss-" + k.zone : k.type] || 0) + 1; },
    loot: (it) => { bump("loot"); if (it.r >= 2) bump("rare"); if (it.r >= 4) bump("legendary"); },
    skill: () => bump("skill"),
    zone: (z) => { if (!z) return; const x = X(); if (!x.d.zones.includes(z.id)) { x.d.zones.push(z.id); bump("zone"); } if (!x.zones.includes(z.id)) { x.zones.push(z.id); checkAch(); ctx.save(); } },
    enhance: (p) => { if (p >= 10) bump("plus10"); },
    level: () => { checkAch(); ctx.save(); },
  };

  // ---------------- the log (a view of the character sheet) ----------------
  const bar = (n, of) => `<i class="wq-bar"><b style="width:${Math.min(100, (100 * n) / of)}%"></b></i>`;
  function html() {
    const x = X();
    const tabs = [["daily", "Daily"], ["ach", "Achievements"], ["codex", "Codex"], ["rank", "Rankings"]];
    let body = "";
    if (tab === "daily") body = `<p class="wr-note">${esc(T("Three hunts a day, the same for everyone. They pay XP, scrap and a potion."))}</p><ul class="wq-list">${todays().map((q) => { const p = Math.min(q.n, x.d.p[q.id] || 0), done = x.d.done.includes(q.id); return `<li class="${done ? "done" : p >= q.n ? "ready" : ""}"><div><b>${esc(T(q.name))}</b><small>+${q.xp} XP · +${q.scrap} ${esc(T("scrap"))}</small>${bar(p, q.n)}</div><span>${p} / ${q.n}</span>${done ? `<em class="ok" aria-label="${esc(T("Done"))}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></em>` : `<button type="button" data-qclaim="${q.id}" ${p >= q.n ? "" : "disabled"}>${esc(T("Claim"))}</button>`}</li>`; }).join("")}</ul>`;
    else if (tab === "ach") body = `<p class="wr-note">${esc(T("Each achievement gives a title to wear under your name."))}</p><ul class="wq-list">${ACH.map((a) => { const got = x.ach.includes(a.id), have = a.ev === "level" ? ctx.level() : a.ev === "zoneSet" ? x.zones.length : x.c[a.ev] || 0, worn = x.title === a.id; return `<li class="${got ? "done" : ""}"><div><b>${esc(T(a.name))}</b><small>${esc(T(a.line))} · ${esc(T("title"))}: “${esc(T(a.title))}”</small>${got ? "" : bar(have, a.n)}</div><span>${Math.min(have, a.n)} / ${a.n}</span>${got ? `<button type="button" data-title="${a.id}" aria-pressed="${worn}">${esc(worn ? T("Worn") : T("Wear"))}</button>` : `<em class="lock" aria-label="${esc(T("Locked"))}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg></em>`}</li>`; }).join("")}</ul>`;
    else if (tab === "codex") body = `<p class="wr-note">${esc(T("Every scammer here is a real scam. Knock one out to unlock its page."))}</p><div class="wq-codex">${CODEX.map((c) => { const n = x.seen[c.id] || 0; return `<article class="${n ? "" : "locked"}"><h4>${esc(n ? T(c.name) : "???")}</h4><p>${esc(n ? T(c.line) : T("Knock one out to learn how this scam works."))}</p><small>${n ? esc(T("Knocked out {n}", { n })) : ""}</small></article>`; }).join("")}</div>`;
    else body = `<p class="wr-note">${esc(T("This week's top hunters. Points come from knock-outs the server counted: a street scammer 1, a hunting-ground scammer 2–4, a boss 10."))}</p>${top ? (top.length ? `<ol class="wq-rank">${top.map((r, i) => `<li class="${i < 3 ? "p" + (i + 1) : ""}"><span>${i + 1}</span><b>${esc(r.name || r.w)}${r.name ? `<small>${esc(r.w)}</small>` : ""}</b><em>${esc(T("{n} points", { n: r.n }))}</em></li>`).join("")}</ol>` : `<p class="wa-empty">${esc(T("Nothing yet."))}</p>`) : `<p class="wa-empty">${esc(T("Loading…"))}</p>`}`;
    return `<nav class="wa-tabs wr-ftabs">${tabs.map(([id, n]) => `<button type="button" data-qtab="${id}" aria-pressed="${id === tab}">${esc(T(n))}</button>`).join("")}</nav>${body}`;
  }
  async function loadTop() { try { const r = await fetch("/api/social?world=hunt-top"); top = r.ok ? ((await r.json()).top || []) : []; } catch { top = []; } }
  function click(b) {
    if (b.dataset.qtab) { tab = b.dataset.qtab; if (tab === "rank") { top = null; loadTop().then(() => ctx.repaint()); } return true; }
    if (b.dataset.qclaim) { claim(b.dataset.qclaim); return true; }
    if (b.dataset.title) { const x = X(); x.title = x.title === b.dataset.title ? "" : b.dataset.title; ctx.save(); ctx.onTitle && ctx.onTitle(); return true; }
    return false;
  }
  const title = () => { const x = X(), a = ACH.find((y) => y.id === x.title); return a ? T(a.title) : ""; };
  const hasPet = () => X().ach.includes("k10");
  const pending = () => { const x = X(); return todays().filter((q) => !x.d.done.includes(q.id) && (x.d.p[q.id] || 0) >= q.n).length; };
  return { on, html, click, title, hasPet, pending, bump };
}

/// the companion drone: floats by your shoulder, pulls street items in and zaps the nearest scammer now and then
export function createPet({ THREE, planet, here, facing, combat, reduce }) {
  const g = new THREE.Group(); g.visible = false; planet.add(g);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14), new THREE.MeshStandardMaterial({ color: 0xeef3f7, metalness: 0.6, roughness: 0.25 }));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 1.4) })); eye.position.z = 0.22;
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 32), new THREE.MeshStandardMaterial({ color: 0x2f86ff, emissive: 0x1d63d6, emissiveIntensity: 1.2 }));
  const r2 = r1.clone(); r2.material = new THREE.MeshStandardMaterial({ color: 0x2ee07a, emissive: 0x17a85a, emissiveIntensity: 1.2 }); r2.rotation.x = Math.PI / 2;
  g.add(body, eye, r1, r2);
  const me = new THREE.Vector3(), want = new THREE.Vector3();
  let zapT = 4;
  return {
    set(on) { g.visible = !!on; },
    visible: () => g.visible, zapNow: () => !!(combat && combat.petZap && combat.petZap(g.position)),
    tick(dt, t, inHub) {
      if (!g.visible) return;
      here(me); const f = facing();
      want.set(me.x - Math.sin(f) * 0.9 + Math.cos(f) * 0.8, me.y + 2.1 + Math.sin(t * 2.2) * 0.15, me.z - Math.cos(f) * 0.9 - Math.sin(f) * 0.8);
      if (g.position.distanceToSquared(want) > 400) g.position.copy(want); else g.position.lerp(want, 1 - Math.exp(-dt * 5)); // fast travel: catch up at once g.rotation.y = f; r1.rotation.y += dt * 2; r2.rotation.z += dt * 2.6;
      if (inHub && combat && (zapT -= dt) <= 0) { zapT = 5; combat.petZap && combat.petZap(g.position); }
    },
  };
}
