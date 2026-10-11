// world-quests.js — the Adventure log: daily hunts, achievements and the titles they give, the scammer codex (what
// each scam really is), this week's top hunters, and a companion drone that comes with the first achievement.
// Everything here pays XP, scrap and potions — never ARCL — so nothing in it can be farmed into tokens.
// Saved inside the character (P.rpg.x), so it travels with world-save.
import { TITLE_BONUS, bonusLine, PETS, petLevel, petNext, xpEvent, ZONES } from "./world-rpg-data.js";
import { seasonOf, SEASON_PTS, SEASON_TIERS, tierOf, quizFor, QUIZ_XP } from "./world-season.js";
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
  { id: "raid1", name: "Raid breaker", line: "Help bring down a weekly raid boss", ev: "raid", n: 1, title: "Raid Breaker" },
  { id: "quiz", name: "Scam spotter", line: "Answer 25 quiz questions right", ev: "quizOk", n: 25, title: "Scam Spotter" },
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
  { id: "boss-raid", name: "The Ponzi Leviathan", line: "\"Guaranteed\" daily returns paid out of the next people's deposits. It grows while new money flows in, then collapses on everyone still inside." },
];
export const QUEST_ZONES = ["spam", "fields", "swamp", "canyon", "depths"];

/// ctx: { T, lang, esc, toast, P, save(), level(), gain(xp, why), rpg (for scrap and potions), Snd, wallet() }
export function createQuests(ctx) {
  const { esc } = ctx;
  const LW = { ko: { Open: "열기",  Daily: "일일", Achievements: "업적", Codex: "도감", Rankings: "순위", Hunters: "사냥꾼", Achievement: "업적", Bring: "데려가기", "Right!": "정답!", Drone: "드론", Cat: "고양이", Season: "시즌", Pets: "펫", Quiz: "퀴즈", Share: "공유", Claim: "받기", Wear: "착용", Worn: "착용 중", Explorer: "탐험가", Legend: "전설", Lucky: "행운아", Done: "완료", Locked: "잠김", scrap: "고철", title: "칭호" }, zh: { Open: "打开",  Daily: "每日", Achievements: "成就", Codex: "图鉴", Rankings: "排行", Hunters: "猎人", Achievement: "成就", Bring: "带上", "Right!": "答对了！", Drone: "无人机", Cat: "猫咪", Season: "赛季", Pets: "宠物", Quiz: "测验", Share: "分享", Claim: "领取", Wear: "佩戴", Worn: "佩戴中", Explorer: "探险家", Legend: "传奇", Lucky: "幸运儿", Done: "完成", Locked: "未解锁", scrap: "废料", title: "称号" } }[ctx.lang] || {};
  const T = (s, v) => (LW[s] != null ? LW[s] : ctx.T(s, v));
  const X = () => {
    const r = ctx.rpg.data(); r.x = r.x || {};
    const x = r.x; x.c = x.c || {}; x.ach = x.ach || []; x.seen = x.seen || {}; x.zones = x.zones || [];
    if (!x.d || x.d.day !== seoulDay()) x.d = { day: seoulDay(), p: {}, done: [], zones: [] };
    const sn = seasonOf(); if (!x.ss || x.ss.id !== sn.id) x.ss = { id: sn.id, pts: 0, got: [] };
    if (!x.qz || x.qz.day !== seoulDay()) x.qz = { day: seoulDay(), a: [], done: 0 };
    x.petXp = x.petXp || {};
    return x;
  };
  const todays = () => { const h = hash(seoulDay()); const pick = []; for (let i = 0; pick.length < 3 && i < 30; i++) { const q = DAILY[(h >> (i * 3)) % DAILY.length]; if (!pick.includes(q)) pick.push(q); } return pick; };
  let tab = "daily", top = null;

  function seasonAdd(kind, n = 1) {
    const x = X(), pts = (SEASON_PTS[kind] || 0) * n; if (!pts) return;
    const before = tierOf(x.ss.pts); x.ss.pts += pts;
    if (tierOf(x.ss.pts) > before) { ctx.toast(T("Season tier {n} reached — claim it in the Adventure log", { n: tierOf(x.ss.pts) })); ctx.Snd.win && ctx.Snd.win(); }
  }
  function bump(ev, n = 1) {
    const x = X(); x.c[ev] = (x.c[ev] || 0) + n;
    if (SEASON_PTS[ev]) seasonAdd(ev, n);
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
    x.d.done.push(id); const r = ctx.rpg.data(); r.scrap = (r.scrap || 0) + q.scrap; r.hp = Math.min(99, (r.hp || 0) + 1); seasonAdd("daily");
    ctx.save(); ctx.gain(q.xp, T(q.name)); ctx.toast(T("+{n} scrap · +1 health potion", { n: q.scrap }));
  }

  // events from the fight (world-combat.js) and the rest of the game
  const on = {
    kill: (k) => { const x = X(); bump("kill"); petFeed(); if (k.rank === "elite") bump("elite"); if (k.rank === "boss") bump("boss"); x.seen[k.rank === "boss" ? "boss-" + k.zone : k.type] = (x.seen[k.rank === "boss" ? "boss-" + k.zone : k.type] || 0) + 1; },
    loot: (it) => { bump("loot"); if (it.r >= 2) bump("rare"); if (it.r >= 4) bump("legendary"); },
    skill: () => bump("skill"),
    zone: (z) => { if (!z) return; const x = X(); if (!x.d.zones.includes(z.id)) { x.d.zones.push(z.id); bump("zone"); } if (!x.zones.includes(z.id)) { x.zones.push(z.id); checkAch(); ctx.save(); } },
    enhance: (p) => { if (p >= 10) bump("plus10"); },
    level: () => { checkAch(); ctx.save(); },
    raid: () => { const x = X(); x.seen["boss-raid"] = (x.seen["boss-raid"] || 0) + 1; bump("raid"); },
    chest: () => { seasonAdd("chest"); ctx.save(); },
  };

  // ---------------- the season log ----------------
  function seasonClaim(i) {
    const x = X(), t = SEASON_TIERS[i]; if (!t || x.ss.got.includes(i) || x.ss.pts < t.pts) return;
    x.ss.got.push(i); const r = ctx.rpg.data();
    if (t.kind === "xp") ctx.gain(t.n, T("Season tier {n}", { n: i + 1 }));
    else if (t.kind === "scrap") { r.scrap = (r.scrap || 0) + t.n; ctx.toast(T("+{n} scrap", { n: t.n })); }
    else if (t.kind === "hp" || t.kind === "sp" || t.kind === "recall") { r[t.kind] = Math.min(99, (r[t.kind] || 0) + t.n); ctx.toast(rewardText(t)); }
    else if (t.kind === "gear") { const it = ctx.rpg.giftPiece(ctx.level(), t.r); ctx.toast(it ? T("Season gear: {x}", { x: ctx.rpg.itemName(it) }) : T("Your bag is full — make room and claim it again")); if (!it) x.ss.got.pop(); }
    if (t.title) { x.stitle = 1; ctx.toast(T("New title: \"{t}\"", { t: T("Season Star") })); }
    ctx.Snd.win && ctx.Snd.win(); ctx.save(); ctx.rpg.refresh && ctx.rpg.refresh();
  }
  const rewardText = (t) => t.kind === "xp" ? T("+{n} XP", { n: t.n }) : t.kind === "scrap" ? T("+{n} scrap", { n: t.n }) : t.kind === "hp" ? T("{n} health potions", { n: t.n }) : t.kind === "sp" ? T("{n} mana potions", { n: t.n }) : t.kind === "recall" ? T("{n} recall scrolls", { n: t.n }) : t.r >= 3 ? T("An Epic piece of gear") : T("A Rare piece of gear");

  // ---------------- the quiz ----------------
  function answer(k) {
    const x = X(), qs = quizFor(x.qz.day), i = x.qz.a.length; if (i >= qs.length) return;
    x.qz.a.push(k); const ok = k === qs[i].right;
    if (ok) { x.c.quizOk = (x.c.quizOk || 0) + 1; ctx.gain(QUIZ_XP, T("Quiz")); ctx.Snd.pick && ctx.Snd.pick(); } else ctx.Snd.bad && ctx.Snd.bad();
    if (x.qz.a.length >= qs.length && !x.qz.done) { x.qz.done = 1; seasonAdd("quiz"); const n = x.qz.a.filter((a, j) => a === qs[j].right).length; ctx.toast(T("Quiz done: {n} of 5 right", { n })); }
    checkAch(); ctx.save();
  }
  function quizHTML(x) {
    const qs = quizFor(x.qz.day), i = x.qz.a.length, right = x.qz.a.filter((a, j) => a === qs[j].right).length;
    const head = `<div class="wq-quiz-h"><b>${esc(T("Scam quiz"))}</b><small>${esc(T("Five a day · +{n} XP for each right answer", { n: QUIZ_XP }))}</small><span class="wq-dots">${qs.map((q, j) => `<i class="${j < i ? (x.qz.a[j] === q.right ? "ok" : "no") : j === i ? "now" : ""}"></i>`).join("")}</span></div>`;
    if (i >= qs.length) return `<section class="wq-quiz done">${head}<p>${esc(T("{n} of 5 right today. New questions tomorrow.", { n: right }))}</p></section>`;
    const last = i > 0 ? qs[i - 1] : null, lastOk = last && x.qz.a[i - 1] === last.right;
    return `<section class="wq-quiz">${head}${last ? `<p class="wq-last ${lastOk ? "ok" : "no"}">${esc(lastOk ? T("Right!") : T("Not quite. The answer: {x}", { x: T(last.opts[last.right]) }))}</p>` : ""}<p class="wq-q">${esc(T(qs[i].q))}</p><div class="wq-opts">${qs[i].opts.map((o, k) => `<button type="button" data-qz="${k}">${esc(T(o))}</button>`).join("")}</div></section>`;
  }

  // ---------------- companions ----------------
  const ownedPets = () => { const x = X(); return PETS.filter((p) => x.ach.includes(p.need)); };
  const activePet = () => { const x = X(), own = ownedPets(); if (!own.length) return ""; if (x.pet === "none") return ""; return (own.find((p) => p.id === x.pet) || own[0]).id; };
  function petFeed() {
    const id = activePet(); if (!id) return; const x = X(), before = petLevel(x.petXp[id] || 0);
    x.petXp[id] = (x.petXp[id] || 0) + 1;
    const lv = petLevel(x.petXp[id]); if (lv > before) { ctx.toast(T("{x} grew to level {n}", { x: T(PETS.find((p) => p.id === id).name), n: lv })); ctx.onPet && ctx.onPet(); }
  }

  // ---------------- the log (a view of the character sheet) ----------------
  const bar = (n, of) => `<i class="wq-bar"><b style="width:${Math.min(100, (100 * n) / of)}%"></b></i>`;
  function html() {
    const x = X();
    const tabs = [["daily", "Daily"], ["ach", "Achievements"], ["season", "Season"], ["codex", "Codex"], ["pets", "Pets"], ["rank", "Rankings"]];
    let body = "";
    const ev = xpEvent(), evZone = ev.zone && ZONES.find((z) => z.id === ev.zone);
    const evHTML = `<div class="wq-event"><b>${esc(ev.all ? T("Weekend: XP ×{k} everywhere", { k: ev.k }) : T("Today: XP ×{k} in {z}", { k: ev.k, z: evZone ? evZone.name : "" }))}</b><small>${esc(T("A different hunting ground each weekday, all of them at the weekend."))}</small></div>`;
    if (tab === "daily") body = `${ctx.signedIn && ctx.signedIn() ? `<div class="wq-chest${ctx.dailyDone && ctx.dailyDone() ? " done" : ""}"><span class="wq-chest-ico" aria-hidden="true"></span><div><b>${esc(T("Daily reward"))}</b><small>${esc(ctx.dailyDone && ctx.dailyDone() ? T("Today's chest is open. Come back tomorrow.") : T("Today's chest is waiting: ARCL and a bonus, more each day of your streak."))}</small></div><button type="button" data-qdaily>${esc(ctx.dailyDone && ctx.dailyDone() ? T("See the week") : T("Open"))}</button></div>` : ""}${evHTML}<p class="wr-note">${esc(T("Three hunts a day, the same for everyone. They pay XP, scrap and a potion."))}</p><ul class="wq-list">${todays().map((q) => { const p = Math.min(q.n, x.d.p[q.id] || 0), done = x.d.done.includes(q.id); return `<li class="${done ? "done" : p >= q.n ? "ready" : ""}"><div><b>${esc(T(q.name))}</b><small>+${q.xp} XP · +${q.scrap} ${esc(T("scrap"))}</small>${bar(p, q.n)}</div><span>${p} / ${q.n}</span>${done ? `<em class="ok" aria-label="${esc(T("Done"))}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></em>` : `<button type="button" data-qclaim="${q.id}" ${p >= q.n ? "" : "disabled"}>${esc(T("Claim"))}</button>`}</li>`; }).join("")}</ul>`;
    else if (tab === "ach") body = `<p class="wr-note">${esc(T("Each achievement gives a title to wear under your name."))}</p><ul class="wq-list">${ACH.map((a) => { const got = x.ach.includes(a.id), have = a.ev === "level" ? ctx.level() : a.ev === "zoneSet" ? x.zones.length : x.c[a.ev] || 0, worn = x.title === a.id; return `<li class="${got ? "done" : ""}"><div><b>${esc(T(a.name))}</b><small>${esc(T(a.line))} · ${esc(T("title"))}: “${esc(T(a.title))}”${TITLE_BONUS[a.id] ? ` <em class="wq-bonus">${esc(bonusLine(TITLE_BONUS[a.id]))}</em>` : ""}</small>${got ? "" : bar(have, a.n)}</div><span>${Math.min(have, a.n)} / ${a.n}</span>${got ? `<span class="wq-acts"><button type="button" data-title="${a.id}" aria-pressed="${worn}">${esc(worn ? T("Worn") : T("Wear"))}</button><button type="button" class="wq-share" data-ashare="${a.id}" aria-label="${esc(T("Share"))}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></span>` : `<em class="lock" aria-label="${esc(T("Locked"))}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg></em>`}</li>`; }).join("")}</ul>`;
    else if (tab === "season") {
      const sn = seasonOf(), pts = x.ss.pts, tier = tierOf(pts), next = SEASON_TIERS[tier], left = Math.max(0, Math.ceil((sn.ends - Date.now()) / 864e5));
      body = `<div class="wq-season"><div><b>${esc(T("Season {n}", { n: sn.id }))}</b><small>${esc(T("{n} days left", { n: left }))}</small></div><strong>${pts.toLocaleString("en-US")} <small>${esc(T("points"))}</small></strong>${bar(next ? pts - (tier ? SEASON_TIERS[tier - 1].pts : 0) : 1, next ? next.pts - (tier ? SEASON_TIERS[tier - 1].pts : 0) : 1)}<em>${esc(next ? T("{n} to tier {t}", { n: next.pts - pts, t: tier + 1 }) : T("Every tier done this season"))}</em></div>
        <p class="wr-note">${esc(T("Points come from playing: a knock-out 1, an elite 3, a boss 15, a daily hunt 10, the quiz 10, the raid 25. Rewards are XP, scrap, potions and gear."))}</p>
        ${SEASON_TIERS.filter((t, i) => pts >= t.pts && !x.ss.got.includes(i)).length > 1 ? `<button type="button" class="wq-claimall" data-sclaimall>${esc(T("Claim all ({n})", { n: SEASON_TIERS.filter((t, i) => pts >= t.pts && !x.ss.got.includes(i)).length }))}</button>` : ""}
        <ol class="wq-tiers">${SEASON_TIERS.map((t, i) => { const got = x.ss.got.includes(i), ok = pts >= t.pts; return `<li class="${got ? "done" : ok ? "ready" : ""}${t.title ? " top" : ""}"><span>${i + 1}</span><div><b>${esc(rewardText(t))}${t.title ? " · " + esc(T("title")) + ": “" + esc(T("Season Star")) + "”" : ""}</b><small>${t.pts.toLocaleString("en-US")} ${esc(T("points"))}</small></div>${got ? `<em class="ok" aria-label="${esc(T("Done"))}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></em>` : `<button type="button" data-sclaim="${i}" ${ok ? "" : "disabled"}>${esc(T("Claim"))}</button>`}</li>`; }).join("")}</ol>
        ${x.stitle ? `<p class="wq-stitle">${esc(T("Your season title"))}: <button type="button" data-title="season" aria-pressed="${x.title === "season"}">${esc(x.title === "season" ? T("Worn") : T("Wear"))} “${esc(T("Season Star"))}”</button></p>` : ""}`;
    }
    else if (tab === "pets") {
      const own = ownedPets(), act = activePet();
      body = `<p class="wr-note">${esc(T("Companions come with achievements and grow with every scammer knocked out while they're with you."))}</p><div class="wq-pets">${PETS.map((p) => { const has = own.includes(p), xp = x.petXp[p.id] || 0, lv = petLevel(xp), nx = petNext(lv), prev = lv > 1 ? petNext(lv - 1) : 0, a = ACH.find((y) => y.id === p.need); return `<article class="wq-pet p-${p.id}${has ? "" : " locked"}${act === p.id ? " on" : ""}"><span class="wq-pet-art" aria-hidden="true"></span><div><b>${esc(T(p.name))}${has ? ` <small>${esc(T("Lv {n}", { n: lv }))}</small>` : ""}</b><small>${esc(T(p.line))}</small>${has ? (nx ? bar(xp - prev, nx - prev) : `<small class="max">${esc(T("Fully grown"))}</small>`) : `<small class="need">${esc(T("Comes with “{x}”", { x: T(a ? a.name : "") }))}</small>`}</div>${has ? `<button type="button" data-pet="${p.id}" aria-pressed="${act === p.id}">${esc(act === p.id ? T("With you") : T("Bring"))}</button>` : ""}</article>`; }).join("")}</div>${act ? `<p class="wq-petoff"><button type="button" data-pet="none">${esc(T("Leave companions at home"))}</button></p>` : ""}`;
    }
    else if (tab === "codex") body = `${quizHTML(x)}<p class="wr-note">${esc(T("Every scammer here is a real scam. Knock one out to unlock its page."))}</p><div class="wq-codex">${CODEX.map((c) => { const n = x.seen[c.id] || 0; return `<article class="${n ? "" : "locked"}"><h4>${esc(n ? T(c.name) : "???")}</h4><p>${esc(n ? T(c.line) : T("Knock one out to learn how this scam works."))}</p><small>${n ? esc(T("Knocked out {n}", { n })) : ""}</small></article>`; }).join("")}</div>`;
    else body = `<nav class="wq-sub"><button type="button" data-rk="hunt" aria-pressed="${rk === "hunt"}">${esc(T("Hunters"))}</button><button type="button" data-rk="raid" aria-pressed="${rk === "raid"}">${esc(T("Raid damage"))}</button></nav><p class="wr-note">${esc(rk === "raid" ? T("This week's raid: damage on the Ponzi Leviathan the server counted.") : T("This week's top hunters. Points come from knock-outs the server counted: a street scammer 1, a hunting-ground scammer 2–4, a boss 10."))}</p>${top ? (top.length ? `<ol class="wq-rank">${top.map((r, i) => `<li class="${i < 3 ? "p" + (i + 1) : ""}"><span>${i + 1}</span><b>${esc(r.name || r.w)}${r.name ? `<small>${esc(r.w)}</small>` : ""}</b><em>${esc(rk === "raid" ? T("{n} damage", { n: Math.round(r.n).toLocaleString("en-US") }) : T("{n} points", { n: r.n }))}</em></li>`).join("")}</ol>` : `<p class="wa-empty">${esc(T("Nothing yet."))}</p>`) : `<p class="wa-empty">${esc(T("Loading…"))}</p>`}`;
    return `<nav class="wa-tabs wr-ftabs">${tabs.map(([id, n]) => `<button type="button" data-qtab="${id}" aria-pressed="${id === tab}">${esc(T(n))}</button>`).join("")}</nav>${body}`;
  }
  let rk = "hunt";
  async function loadTop() { try { const r = await fetch(rk === "raid" ? "/api/social?world=raid" : "/api/social?world=hunt-top"); top = r.ok ? ((await r.json()).top || []) : []; } catch { top = []; } }
  function click(b) {
    if (b.dataset.rk) { rk = b.dataset.rk; top = null; loadTop().then(() => ctx.repaint()); return true; }
    if (b.hasAttribute("data-sclaimall")) { const x = X(); SEASON_TIERS.forEach((t, i) => { if (x.ss.pts >= t.pts && !x.ss.got.includes(i)) seasonClaim(i); }); return true; }
    if (b.dataset.qtab) { tab = b.dataset.qtab; if (tab === "rank") { top = null; loadTop().then(() => ctx.repaint()); } return true; }
    if (b.hasAttribute("data-qdaily")) { ctx.openDaily && ctx.openDaily(); return true; }
    if (b.dataset.qclaim) { claim(b.dataset.qclaim); return true; }
    if (b.dataset.sclaim != null) { seasonClaim(+b.dataset.sclaim); return true; }
    if (b.dataset.qz != null) { answer(+b.dataset.qz); return true; }
    if (b.dataset.pet) { const x = X(); x.pet = b.dataset.pet === x.pet && b.dataset.pet !== "none" ? x.pet : b.dataset.pet; ctx.save(); ctx.onPet && ctx.onPet(); return true; }
    if (b.dataset.ashare) { const a = ACH.find((y) => y.id === b.dataset.ashare); if (a && ctx.shareCard) ctx.shareCard({ head: T("Achievement"), title: T(a.name), line: T(a.line), badge: T(a.title) }); return false; }
    if (b.dataset.title) { const x = X(); x.title = x.title === b.dataset.title ? "" : b.dataset.title; ctx.save(); ctx.rpg.refresh && ctx.rpg.refresh(); ctx.onTitle && ctx.onTitle(); return true; }
    return false;
  }
  const title = () => { const x = X(); if (x.title === "season" && x.stitle) return T("Season Star"); const a = ACH.find((y) => y.id === x.title); return a ? T(a.title) : ""; };
  const titleBonus = () => { const x = X(); return (x.title === "season" ? (x.stitle ? TITLE_BONUS.season : null) : x.ach.includes(x.title) ? TITLE_BONUS[x.title] : null) || null; };
  const hasPet = () => !!activePet();
  const pet = () => { const id = activePet(); return id ? { id, lv: petLevel(X().petXp[id] || 0) } : null; };
  const seasonPending = () => { const x = X(); return SEASON_TIERS.filter((t, i) => x.ss.pts >= t.pts && !x.ss.got.includes(i)).length; };
  const pending = () => { const x = X(); return todays().filter((q) => !x.d.done.includes(q.id) && (x.d.p[q.id] || 0) >= q.n).length + seasonPending(); };
  return { on, html, click, title, titleBonus, hasPet, pet, pending, bump, setTab: (t) => { tab = t; } };
}

/// the companions (world-rpg-data.js PETS): the drone floats by your shoulder and zaps the nearest scammer, the cat
/// trots at your heels and pulls street items in from farther, the Arc wisp circles you and mends a little HP.
/// Each grows with the knock-outs it sees (level 1–10): a stronger zap, a wider pull, a bigger mend.
export function createPet({ THREE, planet, here, facing, combat, reduce }) {
  const root = new THREE.Group(); planet.add(root);
  const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
  // the drone
  const drone = new THREE.Group();
  { const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 14), std(0xeef3f7, { metalness: 0.6, roughness: 0.25 }));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 1.4) })); eye.position.z = 0.22;
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 32), std(0x2f86ff, { emissive: 0x1d63d6, emissiveIntensity: 1.2 }));
    const r2 = r1.clone(); r2.material = std(0x2ee07a, { emissive: 0x17a85a, emissiveIntensity: 1.2 }); r2.rotation.x = Math.PI / 2;
    drone.add(body, eye, r1, r2); drone.userData = { r1, r2 }; }
  // the cat: a little low-poly cat, sitting up when you stop
  const cat = new THREE.Group();
  { const fur = std(0xffb35c, { flatShading: true }), dark = std(0x3a2a20, { flatShading: true }), white = std(0xfff4e6, { flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.6), fur); body.position.y = 0.32;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.3), fur); head.position.set(0, 0.58, 0.34);
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.06), white); muzzle.position.set(0, 0.52, 0.5);
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), fur); earL.position.set(-0.1, 0.78, 0.32); const earR = earL.clone(); earR.position.x = 0.1;
    const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 1.2) }), eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyeM); eyeL.position.set(-0.08, 0.62, 0.495); const eyeR = eyeL.clone(); eyeR.position.x = 0.08;
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 6), dark); tail.position.set(0, 0.5, -0.38); tail.rotation.x = -0.7;
    const legs = [[-0.11, 0.2], [0.11, 0.2], [-0.11, -0.2], [0.11, -0.2]].map(([x, z]) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), white); l.position.set(x, 0.1, z); return l; });
    cat.add(body, head, muzzle, earL, earR, eyeL, eyeR, tail, ...legs); cat.userData = { tail, legs, head }; }
  // the Arc wisp: a soft green flame with two rings
  const wisp = new THREE.Group();
  { const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 2.6, 1.6) }));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    const a = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 6, 40), new THREE.MeshBasicMaterial({ color: 0x8fe6ff })), b = a.clone(); b.material = new THREE.MeshBasicMaterial({ color: 0x39ff88 }); b.rotation.x = Math.PI / 2;
    wisp.add(core, glow, a, b); wisp.userData = { a, b, glow }; }
  const looks = { drone, cat, wisp };
  Object.values(looks).forEach((g) => { g.visible = false; root.add(g); });
  const me = new THREE.Vector3(), want = new THREE.Vector3(), last = new THREE.Vector3();
  let cur = null, g = null, actT = 4, lv = 1;
  return {
    /// p: { id, lv } or null
    set(p) {
      const id = p && looks[p.id] ? p.id : null; lv = (p && p.lv) || 1;
      if (cur !== id) { Object.values(looks).forEach((x) => { x.visible = false; }); cur = id; g = id ? looks[id] : null; if (g) { here(me); g.position.set(me.x, me.y + (id === "cat" ? 0 : 2), me.z); g.visible = true; } }
    },
    id: () => cur, level: () => lv, visible: () => !!(g && g.visible),
    /// how far the companion pulls street items in (the cat pulls farther as it grows)
    pull: () => (cur === "cat" ? 6 + lv * 0.5 : cur ? 4.5 : 0),
    zapNow: () => !!(cur === "drone" && combat && combat.petZap && combat.petZap(g.position, 1 + 0.12 * (lv - 1))),
    tick(dt, t, inHub) {
      if (!g || !g.visible) return;
      here(me); const f = facing();
      if (cur === "cat") {
        want.set(me.x - Math.sin(f) * 1.2 + Math.cos(f) * 0.6, me.y, me.z - Math.cos(f) * 1.2 - Math.sin(f) * 0.6);
        last.copy(g.position);
        if (g.position.distanceToSquared(want) > 400) g.position.copy(want); else g.position.lerp(want, 1 - Math.exp(-dt * 4));
        const sp = last.distanceTo(g.position) / Math.max(1e-3, dt), moving = sp > 0.4;
        if (moving) g.rotation.y = Math.atan2(g.position.x - last.x, g.position.z - last.z);
        const u = g.userData; u.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(t * 14 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; });
        u.tail.rotation.z = Math.sin(t * (moving ? 8 : 2.5)) * 0.4; u.head.rotation.y = moving ? 0 : Math.sin(t * 0.8) * 0.4;
        g.position.y = me.y + (moving ? Math.abs(Math.sin(t * 14)) * 0.05 : 0);
        return;
      }
      const side = cur === "wisp" ? Math.sin(t * 1.3) * 1.1 : 0.8;
      want.set(me.x - Math.sin(f) * 0.9 + Math.cos(f) * side, me.y + (cur === "wisp" ? 1.7 : 2.1) + Math.sin(t * 2.2) * 0.15, me.z - Math.cos(f) * 0.9 - Math.sin(f) * side);
      if (g.position.distanceToSquared(want) > 400) g.position.copy(want); else g.position.lerp(want, 1 - Math.exp(-dt * 5)); // fast travel: catch up at once
      g.rotation.y = f;
      if (cur === "drone") { g.userData.r1.rotation.y += dt * 2; g.userData.r2.rotation.z += dt * 2.6; if (inHub && combat && (actT -= dt) <= 0) { actT = Math.max(2.5, 5 - 0.25 * (lv - 1)); combat.petZap && combat.petZap(g.position, 1 + 0.12 * (lv - 1)); } }
      else { const u = g.userData; u.a.rotation.y += dt * 1.6; u.b.rotation.x += dt * 2.1; u.glow.material.opacity = 0.18 + Math.sin(t * 3) * 0.06; if (inHub && combat && (actT -= dt) <= 0) { actT = 6; combat.heal && combat.heal(0.01 + 0.002 * lv, g.position.clone()); } }
    },
  };
}
