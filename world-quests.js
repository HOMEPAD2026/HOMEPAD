// world-quests.js — the Adventure log: daily hunts, achievements and the titles they give, the scammer codex (what
// each scam really is), this week's top hunters, and a companion drone that comes with the first achievement.
// Everything here pays XP, scrap and potions — never ARCL — so nothing in it can be farmed into tokens.
// Saved inside the character (P.rpg.x), so it travels with world-save.
import { TITLE_BONUS, bonusLine, PETS, petLevel, petNext, xpEvent, ZONES, WEEKDAY_ZONE } from "./world-rpg-data.js";
import { seasonOf, SEASON_PTS, SEASON_TIERS, tierOf, quizFor, QUIZ_XP } from "./world-season.js";
const NEWK = "arc.world.newTabs";
const seenTabs = () => { try { return JSON.parse(localStorage.getItem(NEWK) || "[]"); } catch { return []; } };
export const isNewTab = (k) => !seenTabs().includes(k);
export const seeTab = (k) => { try { const a = seenTabs(); if (!a.includes(k)) { a.push(k); localStorage.setItem(NEWK, JSON.stringify(a)); } } catch { /* private */ } };
const nb = (k) => (isNewTab(k) ? '<i class="nb">NEW</i>' : "");
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
  { id: "spam", name: "Spam Bot", line: "Floods replies and DMs with fake giveaways and links. Real projects don't DM you first, and never ask you to \"verify\" a wallet.", beat: "Don't open links from DMs or replies. Type the project's site in yourself." },
  { id: "drop", name: "Fake Airdrop", line: "A \"free\" token or NFT that asks you to approve a contract or sign a message to claim it. The approval lets it drain your wallet.", beat: "Never approve or sign anything to claim. A real airdrop lands in your wallet or is claimed on the official site." },
  { id: "rug", name: "Rug Gremlin", line: "A coin whose team can pull the liquidity or mint more at will. Check locks, ownership and holders in the Scanner before you buy.", beat: "Check the LP lock, the owner and the top holders in the Scanner first." },
  { id: "boss-spam", name: "The Spam King", line: "Impersonates support: a fake help account that asks for your recovery phrase. Nobody real will ever ask for it.", beat: "Never share your recovery phrase. Real support never messages you first." },
  { id: "boss-fields", name: "The Free Mint", line: "A mint page cloned from a real project, with a malicious contract behind the button. Only mint from links the project posts itself.", beat: "Mint only from the link on the project's own account." },
  { id: "boss-swamp", name: "The Honeypot Queen", line: "A token you can buy but can't sell: the contract blocks sells for everyone but the owner. The Scanner's sell simulation catches it.", beat: "Run the Scanner's sell test before you buy." },
  { id: "boss-canyon", name: "The Rug Titan", line: "A big launch with unlocked liquidity and a team wallet holding most of the supply. When it dumps, the price goes to zero.", beat: "Look for locked liquidity and a holder list that isn't one wallet." },
  { id: "boss-depths", name: "The Rug Dragon", line: "The long con: months of hype, then the treasury and liquidity vanish together. Check where the money sits and who can move it.", beat: "Follow the money: who can move the treasury, and is any of it locked?" },
  { id: "boss-raid", name: "The Ponzi Leviathan", line: "\"Guaranteed\" daily returns paid out of the next people's deposits. It grows while new money flows in, then collapses on everyone still inside.", beat: "Fixed daily returns don't exist. If payouts depend on new deposits, it's a Ponzi." },
];
// the six scammers of the story (world-kit.js SCAMMERS): their page opens when you beat them on the planet
export const CODEX_STORY = [
  { id: "st-phisher", story: "phisher", name: "The Phisher", line: "Promises a prize if you approve his contract. The approval lets him spend your tokens, now or later.", beat: "Check the contract in the Scanner. Never approve a stranger's contract." },
  { id: "st-airdrop", story: "airdrop", name: "The Fake Airdrop", line: "Says your airdrop is ready, if you first send a little money \"for gas\".", beat: "A real airdrop never asks you to pay first. Check the project's official channels." },
  { id: "st-honeypot", story: "honeypot", name: "The Honeypot", line: "\"Nobody has sold yet!\" That's because the contract won't let anyone sell.", beat: "Dry-run a sell in the Scanner before you buy." },
  { id: "st-doppel", story: "doppel", name: "The Doppelganger", line: "A \"v2\" with the same ticker and a different contract: a copy of the real coin.", beat: "Tickers aren't unique, addresses are. Compare it with the official address." },
  { id: "st-golem", story: "golem", name: "The Dump Golem", line: "The dev holds a huge share and promises not to sell.", beat: "A promise isn't a lock. Check the holders in the Scanner and the locks in the Locker." },
  { id: "st-dragon", story: "dragon", name: "The Rug Dragon", line: "Unlocked liquidity and \"trust us\". One transaction empties the pool.", beat: "Check the LP lock in the Locker before you buy." },
];
export const QUEST_ZONES = ["spam", "fields", "swamp", "canyon", "depths"];

/// ctx: { T, lang, esc, toast, P, save(), level(), gain(xp, why), rpg (for scrap and potions), Snd, wallet() }
export function createQuests(ctx) {
  const { esc } = ctx;
  const LW = { ko: { Players: "플레이어", Levels: "레벨", Bosses: "보스", Raids: "레이드", "Knock-outs": "처치", Open: "열기",  Daily: "일일", Achievements: "업적", Codex: "도감", Rankings: "순위", Hunters: "사냥꾼", Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토", Sun: "일", All: "전체", Save: "저장", Achievement: "업적", Bring: "데려가기", "Right!": "정답!", Drone: "드론", Cat: "고양이", Season: "시즌", Pets: "펫", Quiz: "퀴즈", Share: "공유", Claim: "받기", Wear: "착용", Worn: "착용 중", Explorer: "탐험가", Legend: "전설", Lucky: "행운아", Done: "완료", Locked: "잠김", scrap: "고철", title: "칭호" }, zh: { Players: "玩家", Levels: "等级", Bosses: "首领", Raids: "团战", "Knock-outs": "击倒", Open: "打开",  Daily: "每日", Achievements: "成就", Codex: "图鉴", Rankings: "排行", Hunters: "猎人", Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六", Sun: "周日", All: "全部", Save: "保存", Achievement: "成就", Bring: "带上", "Right!": "答对了！", Drone: "无人机", Cat: "猫咪", Season: "赛季", Pets: "宠物", Quiz: "测验", Share: "分享", Claim: "领取", Wear: "佩戴", Worn: "佩戴中", Explorer: "探险家", Legend: "传奇", Lucky: "幸运儿", Done: "完成", Locked: "未解锁", scrap: "废料", title: "称号" } }[ctx.lang] || {};
  const T = (s, v) => (LW[s] != null ? LW[s] : ctx.T(s, v));
  const X = () => {
    const r = ctx.rpg.data(); r.x = r.x || {};
    const x = r.x; x.c = x.c || {}; x.ach = x.ach || []; x.seen = x.seen || {}; x.zones = x.zones || [];
    if (!x.d || x.d.day !== seoulDay()) x.d = { day: seoulDay(), p: {}, done: [], zones: [] };
    const sn = seasonOf(); if (!x.ss || x.ss.id !== sn.id) { if (x.ss && x.ss.pts) x.ssPrev = { id: x.ss.id, pts: x.ss.pts, k: x.ss.k || {}, star: !!x.stitle }; x.ss = { id: sn.id, pts: 0, got: [], k: {} }; }
    if (!x.qz || x.qz.day !== seoulDay()) x.qz = { day: seoulDay(), a: [], done: 0 };
    x.petXp = x.petXp || {};
    return x;
  };
  const todays = () => { const h = hash(seoulDay()); const pick = []; for (let i = 0; pick.length < 3 && i < 30; i++) { const q = DAILY[(h >> (i * 3)) % DAILY.length]; if (!pick.includes(q)) pick.push(q); } return pick; };
  let tab = "daily", top = null;

  function seasonAdd(kind, n = 1) {
    const x = X(), pts = (SEASON_PTS[kind] || 0) * n; if (!pts) return;
    const before = tierOf(x.ss.pts); x.ss.pts += pts; x.ss.k = x.ss.k || {}; x.ss.k[kind] = (x.ss.k[kind] || 0) + n; // what the season was made of, for its card
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

  // the week at a glance: which ground has the XP event each day, and the raid's Monday reset
  const DAYN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  function weekHTML() {
    const today = (new Date(Date.now() + 9 * 3600e3).getUTCDay() + 6) % 7;
    return `<ol class="wq-week">${DAYN.map((d, i) => { const zid = WEEKDAY_ZONE[(i + 1) % 7], z = zid && ZONES.find((y) => y.id === zid); return `<li class="${i === today ? "now" : ""}" style="--zc:${z ? "#" + z.color.toString(16).padStart(6, "0") : "#39ff88"}"><b>${esc(T(d))}</b><small>${esc(z ? z.name.split(" ")[0] : T("All"))}</small>${i === 0 ? `<em>${esc(T("New raid"))}</em>` : ""}</li>`; }).join("")}</ol>`;
  }
  // ---------------- the season log ----------------
  function seasonClaim(i) {
    const x = X(), t = SEASON_TIERS[i]; if (!t || x.ss.got.includes(i) || x.ss.pts < t.pts) return;
    x.ss.got.push(i); const r = ctx.rpg.data();
    if (t.kind === "xp") ctx.gain(t.n, T("Season tier {n}", { n: i + 1 }));
    else if (t.kind === "scrap") { r.scrap = (r.scrap || 0) + t.n; ctx.toast(T("+{n} scrap", { n: t.n })); }
    else if (t.kind === "hp" || t.kind === "sp" || t.kind === "recall") { r[t.kind] = Math.min(99, (r[t.kind] || 0) + t.n); ctx.toast(rewardText(t)); }
    else if (t.kind === "gear") { const it = ctx.rpg.giftPiece(ctx.level(), t.r); ctx.toast(it ? T("Season gear: {x}", { x: ctx.rpg.itemName(it) }) : T("Your bag is full — make room and claim it again")); if (!it) x.ss.got.pop(); }
    if (t.title) { x.stitle = 1; ctx.toast(T("New title: \"{t}\"", { t: T("Season Star") })); }
    ctx.Snd.win && ctx.Snd.win(); ctx.save(); ctx.rpg.refresh && ctx.rpg.refresh(); pop(rewardText(t));
  }
  // the ten tiers as a road: nodes along a line that fills with your points
  function trackHTML(x, pts) {
    const last = SEASON_TIERS[SEASON_TIERS.length - 1].pts, k = Math.min(1, pts / last);
    return `<div class="wq-track" aria-hidden="true"><i class="wq-track-fill" style="width:${(100 * k).toFixed(1)}%"></i>${SEASON_TIERS.map((t, i) => `<span class="${x.ss.got.includes(i) ? "done" : pts >= t.pts ? "ready" : ""} k-${t.kind}${t.title ? " top" : ""}" style="left:${((100 * t.pts) / last).toFixed(1)}%"><b>${i + 1}</b></span>`).join("")}</div>`;
  }
  // a claimed tier: the reward rises out of a little chest
  function pop(text) {
    const d = document.createElement("div"); d.className = "wq-pop"; d.setAttribute("aria-hidden", "true"); d.setAttribute("data-no-i18n", "");
    d.innerHTML = `<span class="wq-pop-chest"></span><b>${esc(text)}</b>`; document.body.appendChild(d); setTimeout(() => d.remove(), 1700);
  }
  /// a note when the season is about to end and tiers are still waiting (once a day)
  function seasonNotice(say) {
    const sn = seasonOf(), left = sn.ends - Date.now(), n = seasonPending(); if (left > 2 * 864e5 || left <= 0) return;
    const key = "arc.world.seasonNote", day = seoulDay(); try { if (localStorage.getItem(key) === day) return; localStorage.setItem(key, day); } catch { return; }
    say(n ? T("Season {s} ends in {d}. {n} tiers are waiting in the Adventure log.", { s: sn.id, d: left > 864e5 ? T("2 days") : T("a day"), n }) : T("Season {s} ends in {d}. A new one starts right after.", { s: sn.id, d: left > 864e5 ? T("2 days") : T("a day") }), "#ffc861");
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
    if (i >= qs.length) { const lq = qs[qs.length - 1]; return `<section class="wq-quiz done">${head}${lq.why ? `<p class="wq-why">${esc(T(lq.why))}</p>` : ""}<p>${esc(T("{n} of 5 right today. New questions tomorrow.", { n: right }))}</p></section>`; }
    const last = i > 0 ? qs[i - 1] : null, lastOk = last && x.qz.a[i - 1] === last.right;
    return `<section class="wq-quiz">${head}${last ? `<p class="wq-last ${lastOk ? "ok" : "no"}">${esc(lastOk ? T("Right!") : T("Not quite. The answer: {x}", { x: T(last.opts[last.right]) }))}</p>${last.why ? `<p class="wq-why">${esc(T(last.why))}</p>` : ""}` : ""}<p class="wq-q">${esc(T(qs[i].q))}</p><div class="wq-opts">${qs[i].opts.map((o, k) => `<button type="button" data-qz="${k}">${esc(T(o))}</button>`).join("")}</div></section>`;
  }

  // ---------------- companions ----------------
  const ownedPets = () => { const x = X(); return PETS.filter((p) => x.ach.includes(p.need)); };
  const activePet = () => { const x = X(), own = ownedPets(); if (!own.length) return ""; if (x.pet === "none") return ""; return (own.find((p) => p.id === x.pet) || own[0]).id; };
  function petFeed() {
    const id = activePet(); if (!id) return; const x = X(), before = petLevel(x.petXp[id] || 0);
    x.petXp[id] = (x.petXp[id] || 0) + 1;
    const lv = petLevel(x.petXp[id]); if (lv > before) { ctx.toast(T("{x} grew to level {n}", { x: T(PETS.find((p) => p.id === id).name), n: lv })); ctx.onPet && ctx.onPet(); }
  }

  // ---------------- rankings: players (the directory and who's on now), levels, codex, hunters, raid, race ----------------
  const RK = [["players", "Players"], ["level", "Levels"], ["codex", "Codex"], ["hunt", "Hunters"], ["raid", "Raid damage"]];
  const titleOf = (t) => (t === "season" ? T("Season Star") : (ACH.find((a) => a.id === t) || {}).title ? T(ACH.find((a) => a.id === t).title) : "");
  const agoOf = (t) => { if (!t) return ""; const m = Math.floor((Date.now() - t) / 60000); return m < 15 ? T("just now") : m < 60 ? T("{n} min ago", { n: m }) : m < 1440 ? T("{n} h ago", { n: Math.floor(m / 60) }) : m < 2880 ? T("yesterday") : T("{n} days ago", { n: Math.floor(m / 1440) }); };
  const face = (c) => { const src = ctx.charThumb ? ctx.charThumb(c) : ""; return `<i class="wq-face">${src ? `<img src="${src}" alt="">` : ""}</i>`; };
  const prow = (r, i, val) => `<li class="${i < 3 ? "p" + (i + 1) : ""}"><button type="button" data-prof="${esc(r.w)}"><span>${i + 1}</span>${face(r.char)}<b>${esc(r.name || r.w.slice(0, 6) + "…" + r.w.slice(-4))}${titleOf(r.t) ? `<small>${esc(titleOf(r.t))}</small>` : ""}</b><em>${val}</em></button></li>`;
  function rankHTML() {
    const nav = `<nav class="wq-sub wq-sub-rk">${RK.map(([id, n]) => `<button type="button" data-rk="${id}" aria-pressed="${rk === id}">${esc(T(n))}${id === "raid" ? nb("raidrank") : id === "players" ? nb("players") : ""}</button>`).join("")}</nav>`;
    const wait = `<p class="wa-empty">${esc(T("Loading…"))}</p>`, none = `<p class="wa-empty">${esc(T("Nothing yet."))}</p>`;
    if (rk === "players" || rk === "level" || rk === "codex") {
      if (!dir) return nav + wait;
      const L = dir.list || [];
      if (rk === "players") {
        const on = ctx.online ? ctx.online() : [];
        return nav + `<p class="wr-note">${esc(T("{n} players have played with a wallet. Tap one for their card.", { n: (dir.n || L.length).toLocaleString("en-US") }))}</p>` +
          `<h4 class="wq-past-h">${esc(T("Around you now"))} <small>${on.length}</small></h4>${on.length ? `<div class="wq-online">${on.map((o) => `<button type="button" data-prof="${esc(o.wallet)}"><i></i>${esc(o.name)} <small>Lv ${o.lv}</small></button>`).join("")}</div>` : `<p class="wa-empty">${esc(T("Nobody signed in nearby right now."))}</p>`}` +
          `<h4 class="wq-past-h">${esc(T("Everyone, most recent first"))}</h4>` + (L.length ? `<ol class="wq-rank wq-players">${L.slice(0, 100).map((r, i) => prow(r, 99, `Lv ${r.lv}<small>${esc(agoOf(r.at))}</small>`).replace('<span>100</span>', "")).join("")}</ol>` : none);
      }
      const by = rk === "level" ? [...L].sort((a, b) => b.lv - a.lv || b.cx - a.cx) : [...L].filter((r) => r.cx > 0).sort((a, b) => b.cx - a.cx || b.lv - a.lv);
      return nav + `<p class="wr-note">${esc(rk === "level" ? T("Everyone who's played with a wallet, by level.") : T("Codex pages found: every page is a real scam learned."))}</p>` + (by.length ? `<ol class="wq-rank">${by.slice(0, 50).map((r, i) => prow(r, i, rk === "level" ? `Lv ${r.lv}` : esc(T("{n} of 15 pages", { n: r.cx })))).join("")}</ol>` : none);
    }
    if (rk === "race") {
      const fmt = (ms) => (ms / 1000).toFixed(2) + " s";
      return nav + `<p class="wr-note">${esc(T("This week's fastest hoverboard laps around the plaza. Start at the gold ring by the fountain."))}</p>` + (race ? (race.length ? `<ol class="wq-rank">${race.map((r, i) => `<li class="${i < 3 ? "p" + (i + 1) : ""}"><span>${i + 1}</span><b>${esc(r.name || r.w)}${r.name ? `<small>${esc(r.w)}</small>` : ""}</b><em>${fmt(r.ms)}</em></li>`).join("")}</ol>` : none) : wait);
    }
    return nav + `<p class="wr-note">${esc(rk === "raid" ? T("This week's raid: damage on the Ponzi Leviathan the server counted.") : T("This week's top hunters. Points come from knock-outs the server counted: a street scammer 1, a hunting-ground scammer 2–4, a boss 10."))}</p>${top ? (top.length ? `<ol class="wq-rank">${top.map((r, i) => `<li class="${i < 3 ? "p" + (i + 1) : ""}"><span>${i + 1}</span><b>${esc(r.name || r.w)}${r.name ? `<small>${esc(r.w)}</small>` : ""}</b><em>${esc(rk === "raid" ? T("{n} damage", { n: Math.round(r.n).toLocaleString("en-US") }) : T("{n} points", { n: r.n }))}</em></li>`).join("")}</ol>` : `<p class="wa-empty">${esc(T("Nothing yet."))}</p>`) : `<p class="wa-empty">${esc(T("Loading…"))}</p>`}${rk === "raid" && past && past.length ? `<h4 class="wq-past-h">${esc(T("Past raids"))}</h4><ul class="wq-past">${past.map((w) => `<li><b>${esc(w.week)}</b><span>${esc(T("{n} raiders", { n: w.players }))} · ${esc(T("{n} HP", { n: w.max.toLocaleString("en-US") }))}</span><em class="${w.fell ? "ok" : ""}">${esc(w.fell ? T("fell after {h} h", { h: w.hours }) : T("stood"))}</em></li>`).join("")}</ul>` : ""}`;
  }
  // ---------------- the log (a view of the character sheet) ----------------
  const bar = (n, of) => `<i class="wq-bar"><b style="width:${Math.min(100, (100 * n) / of)}%"></b></i>`;
  function html() {
    const x = X();
    const tabs = [["daily", "Daily"], ["ach", "Achievements"], ["season", "Season"], ["codex", "Codex"], ["pets", "Pets"], ["rank", "Rankings"]];
    let body = "";
    const ev = xpEvent(), evZone = ev.zone && ZONES.find((z) => z.id === ev.zone);
    const evHTML = `<div class="wq-event"><b>${esc(ev.all ? T("Weekend: XP ×{k} everywhere", { k: ev.k }) : T("Today: XP ×{k} in {z}", { k: ev.k, z: evZone ? evZone.name : "" }))}</b><small>${esc(T("A different hunting ground each weekday, all of them at the weekend."))}</small>${weekHTML()}</div>`;
    if (tab === "daily") body = `${ctx.signedIn && ctx.signedIn() ? `<div class="wq-chest${ctx.dailyDone && ctx.dailyDone() ? " done" : ""}"><span class="wq-chest-ico" aria-hidden="true"></span><div><b>${esc(T("Daily reward"))}</b><small>${esc(ctx.dailyDone && ctx.dailyDone() ? T("Today's chest is open. Come back tomorrow.") : T("Today's chest is waiting: ARCL and a bonus, more each day of your streak."))}</small></div><button type="button" data-qdaily>${esc(ctx.dailyDone && ctx.dailyDone() ? T("See the week") : T("Open"))}</button></div>` : ""}${evHTML}<p class="wr-note">${esc(T("Three hunts a day, the same for everyone. They pay XP, scrap and a potion."))}</p><ul class="wq-list">${todays().map((q) => { const p = Math.min(q.n, x.d.p[q.id] || 0), done = x.d.done.includes(q.id); return `<li class="${done ? "done" : p >= q.n ? "ready" : ""}"><div><b>${esc(T(q.name))}</b><small>+${q.xp} XP · +${q.scrap} ${esc(T("scrap"))}</small>${bar(p, q.n)}</div><span>${p} / ${q.n}</span>${done ? `<em class="ok" aria-label="${esc(T("Done"))}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></em>` : `<button type="button" data-qclaim="${q.id}" ${p >= q.n ? "" : "disabled"}>${esc(T("Claim"))}</button>`}</li>`; }).join("")}</ul>`;
    else if (tab === "ach") body = `<p class="wr-note">${esc(T("Each achievement gives a title to wear under your name."))}</p><ul class="wq-list">${ACH.map((a) => { const got = x.ach.includes(a.id), have = a.ev === "level" ? ctx.level() : a.ev === "zoneSet" ? x.zones.length : x.c[a.ev] || 0, worn = x.title === a.id; return `<li class="${got ? "done" : ""}"><div><b>${esc(T(a.name))}</b><small>${esc(T(a.line))} · ${esc(T("title"))}: “${esc(T(a.title))}”${TITLE_BONUS[a.id] ? ` <em class="wq-bonus">${esc(bonusLine(TITLE_BONUS[a.id]))}</em>` : ""}</small>${got ? "" : bar(have, a.n)}</div><span>${Math.min(have, a.n)} / ${a.n}</span>${got ? `<span class="wq-acts"><button type="button" data-title="${a.id}" aria-pressed="${worn}">${esc(worn ? T("Worn") : T("Wear"))}</button><button type="button" class="wq-share" data-ashare="${a.id}" aria-label="${esc(T("Share"))}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></span>` : `<em class="lock" aria-label="${esc(T("Locked"))}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg></em>`}</li>`; }).join("")}</ul>`;
    else if (tab === "season") {
      const sn = seasonOf(), pts = x.ss.pts, tier = tierOf(pts), next = SEASON_TIERS[tier], left = Math.max(0, Math.ceil((sn.ends - Date.now()) / 864e5));
      body = `<div class="wq-season"><div><b>${esc(T("Season {n}", { n: sn.id }))}</b><small>${esc(T("{n} days left", { n: left }))}</small></div><strong>${pts.toLocaleString("en-US")} <small>${esc(T("points"))}</small></strong>${bar(next ? pts - (tier ? SEASON_TIERS[tier - 1].pts : 0) : 1, next ? next.pts - (tier ? SEASON_TIERS[tier - 1].pts : 0) : 1)}<em>${esc(next ? T("{n} to tier {t}", { n: next.pts - pts, t: tier + 1 }) : T("Every tier done this season"))}</em></div>
        <p class="wr-note">${esc(T("Points come from playing: a knock-out 1, an elite 3, a boss 15, a daily hunt 10, the quiz 10, the raid 25. Rewards are XP, scrap, potions and gear."))}</p>
        ${trackHTML(x, pts)}
        ${SEASON_TIERS.filter((t, i) => pts >= t.pts && !x.ss.got.includes(i)).length > 1 ? `<button type="button" class="wq-claimall" data-sclaimall>${esc(T("Claim all ({n})", { n: SEASON_TIERS.filter((t, i) => pts >= t.pts && !x.ss.got.includes(i)).length }))}</button>` : ""}
        <ol class="wq-tiers">${SEASON_TIERS.map((t, i) => { const got = x.ss.got.includes(i), ok = pts >= t.pts; return `<li class="${got ? "done" : ok ? "ready" : ""}${t.title ? " top" : ""}"><span>${i + 1}</span><div><b>${esc(rewardText(t))}${t.title ? " · " + esc(T("title")) + ": “" + esc(T("Season Star")) + "”" : ""}</b><small>${t.pts.toLocaleString("en-US")} ${esc(T("points"))}</small></div>${got ? `<em class="ok" aria-label="${esc(T("Done"))}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></em>` : `<button type="button" data-sclaim="${i}" ${ok ? "" : "disabled"}>${esc(T("Claim"))}</button>`}</li>`; }).join("")}</ol>
        ${x.stitle ? `<p class="wq-stitle">${esc(T("Your season title"))}: <button type="button" data-title="season" aria-pressed="${x.title === "season"}">${esc(x.title === "season" ? T("Worn") : T("Wear"))} “${esc(T("Season Star"))}”</button></p>` : ""}
        <div class="wq-recap">${x.ss.pts ? `<button type="button" class="wp-btn" data-srecap="cur">${esc(T("Share my season"))}</button>` : ""}${x.ssPrev ? `<p>${esc(T("Season {n}: {p} points, tier {t}", { n: x.ssPrev.id, p: x.ssPrev.pts.toLocaleString("en-US"), t: tierOf(x.ssPrev.pts) }))} <button type="button" class="wp-link" data-srecap="prev">${esc(T("Share its card"))}</button></p>` : ""}</div>`;
    }
    else if (tab === "pets") {
      const own = ownedPets(), act = activePet();
      body = `<p class="wr-note">${esc(T("Companions come with achievements and grow with every scammer knocked out while they're with you."))}</p><div class="wq-pets">${PETS.map((p) => { const has = own.includes(p), xp = x.petXp[p.id] || 0, lv = petLevel(xp), nx = petNext(lv), prev = lv > 1 ? petNext(lv - 1) : 0, a = ACH.find((y) => y.id === p.need); return `<article class="wq-pet p-${p.id}${has ? "" : " locked"}${act === p.id ? " on" : ""}"><span class="wq-pet-art" aria-hidden="true">${ctx.petThumb && ctx.petThumb(p.id) ? `<img src="${ctx.petThumb(p.id)}" alt="">` : ""}</span><div><b>${esc(T(p.name))}${has ? ` <small>${esc(T("Lv {n}", { n: lv }))}</small>` : ""}</b><small>${esc(T(p.line))}</small>${has ? `<span class="wq-petname"><input data-petname="${p.id}" maxlength="12" value="${esc(petName(p.id))}" placeholder="${esc(T("Give it a name"))}" autocomplete="off" spellcheck="false"><button type="button" data-petsave="${p.id}">${esc(T("Save"))}</button></span>` : ""}${has && lv < 10 ? `<small class="wq-petnext">${esc(lv < 5 ? T("New look at level 5") : T("Golden at level 10"))}</small>` : ""}${has ? (nx ? bar(xp - prev, nx - prev) : `<small class="max">${esc(T("Fully grown"))}</small>`) : `<small class="need">${esc(T("Comes with “{x}”", { x: T(a ? a.name : "") }))}</small>`}</div>${has ? `<button type="button" data-pet="${p.id}" aria-pressed="${act === p.id}">${esc(act === p.id ? T("With you") : T("Bring"))}</button>` : ""}</article>`; }).join("")}</div>${act ? `<p class="wq-petoff"><button type="button" data-pet="none">${esc(T("Leave companions at home"))}</button></p>` : ""}`;
    }
    else if (tab === "codex") {
      const beaten = (ctx.P && ctx.P.beaten) || [], all = [...CODEX_STORY, ...CODEX], got = all.filter((c) => (c.story ? beaten.includes(c.story) : x.seen[c.id])).length;
      const page = (c) => { const n = c.story ? (beaten.includes(c.story) ? 1 : 0) : x.seen[c.id] || 0; return `<article class="${n ? "" : "locked"}${c.story ? " story" : ""}"><h4>${esc(n ? T(c.name) : "???")}</h4><p>${esc(n ? T(c.line) : c.story ? T("Beat this scammer on the planet to open its page.") : T("Knock one out to learn how this scam works."))}</p>${n && c.beat ? `<p class="wq-beat"><b>${esc(T("How to beat it"))}</b> ${esc(T(c.beat))}</p>` : ""}<small>${n ? esc(c.story ? T("Beaten on the planet") : T("Knocked out {n}", { n })) : ""}</small></article>`; };
      body = `${quizHTML(x)}<div class="wq-codex-h"><b>${esc(T("{n} of {m} pages", { n: got, m: all.length }))}</b>${bar(got, all.length)}</div><p class="wr-note">${esc(T("Every scammer here is a real scam. Beat one to open its page: how the trick works and how to beat it."))}</p><h4 class="wq-codex-sec">${esc(T("The story's six"))}</h4><div class="wq-codex">${CODEX_STORY.map(page).join("")}</div><h4 class="wq-codex-sec">${esc(T("Hunting grounds and the raid"))}</h4><div class="wq-codex">${CODEX.map(page).join("")}</div>`;
    }
    else body = rankHTML();
    return `<nav class="wa-tabs wr-ftabs">${tabs.map(([id, n]) => `<button type="button" data-qtab="${id}" aria-pressed="${id === tab}">${esc(T(n))}${id === "season" || id === "pets" ? nb(id) : ""}</button>`).join("")}</nav>${body}`;
  }
  let rk = "players", dir = null, dirAt = 0, race = null;
  let past = null;
  async function loadTop() {
    if (rk === "players" || rk === "level" || rk === "codex") { if (!dir || Date.now() - dirAt > 60e3) { try { const r = await fetch("/api/social?world=players"); dir = r.ok ? await r.json() : { list: [] }; dirAt = Date.now(); } catch { dir = dir || { list: [] }; } if (ctx.needThumbs) ctx.needThumbs([...new Set((dir.list || []).slice(0, 100).map((r) => r.char))]); } return; }
    if (rk === "race") { try { const r = await fetch("/api/social?world=race-top"); race = r.ok ? ((await r.json()).top || []) : []; } catch { race = []; } return; }
    try { const r = await fetch(rk === "raid" ? "/api/social?world=raid" : "/api/social?world=hunt-top"); top = r.ok ? ((await r.json()).top || []) : []; } catch { top = []; }
    if (rk === "raid" && !past) { try { const r = await fetch("/api/social?world=raid-history"); past = r.ok ? ((await r.json()).weeks || []) : []; } catch { past = []; } }
  }
  function click(b) {
    if (b.dataset.rk) { rk = b.dataset.rk; if (rk === "raid") seeTab("raidrank"); if (rk === "players") seeTab("players"); top = null; if (rk === "race") race = null; loadTop().then(() => ctx.repaint()); return true; }
    if (b.dataset.prof) { if (ctx.openProfile) ctx.openProfile(b.dataset.prof); return false; }
    if (b.hasAttribute("data-sclaimall")) { const x = X(); SEASON_TIERS.forEach((t, i) => { if (x.ss.pts >= t.pts && !x.ss.got.includes(i)) seasonClaim(i); }); return true; }
    if (b.dataset.qtab) { tab = b.dataset.qtab; seeTab(tab); if (tab === "rank") { top = null; loadTop().then(() => ctx.repaint()); } return true; }
    if (b.hasAttribute("data-qdaily")) { ctx.openDaily && ctx.openDaily(); return true; }
    if (b.dataset.qclaim) { claim(b.dataset.qclaim); return true; }
    if (b.dataset.sclaim != null) { seasonClaim(+b.dataset.sclaim); return true; }
    // the season's card: points, tier and what they came from
    if (b.dataset.srecap) { const x = X(), s = b.dataset.srecap === "prev" ? x.ssPrev : x.ss; if (s && ctx.shareCard) { const k = s.k || {}, t = tierOf(s.pts); ctx.shareCard({ head: T("Season {n}", { n: s.id }), title: T("{p} points · tier {t}", { p: s.pts.toLocaleString("en-US"), t }), line: t >= SEASON_TIERS.length ? T("Every tier of the season road, done.") : T("{n} of {m} tiers on the season road", { n: t, m: SEASON_TIERS.length }), stats: [[T("Knock-outs"), (k.kill || 0).toLocaleString("en-US")], [T("Bosses"), k.boss || 0], [T("Raids"), k.raid || 0], [T("Quiz days"), k.quiz || 0]] }); } return false; }
    if (b.dataset.qz != null) { answer(+b.dataset.qz); return true; }
    if (b.dataset.petsave) { const x = X(), inp = b.parentElement.querySelector("input"), v = String((inp && inp.value) || "").replace(/[\u0000-\u001f<>"'`\\]/g, "").trim().slice(0, 12); x.petName = { ...(x.petName || {}), [b.dataset.petsave]: v }; ctx.save(); ctx.onPet && ctx.onPet(); ctx.toast(v ? T("Your companion is called {x}", { x: v }) : T("Name cleared")); return true; }
    if (b.dataset.pet) { const x = X(); x.pet = b.dataset.pet === x.pet && b.dataset.pet !== "none" ? x.pet : b.dataset.pet; ctx.save(); ctx.onPet && ctx.onPet(); return true; }
    if (b.dataset.ashare) { const a = ACH.find((y) => y.id === b.dataset.ashare); if (a && ctx.shareCard) ctx.shareCard({ head: T("Achievement"), title: T(a.name), line: T(a.line), badge: T(a.title), icon: a.id }); return false; }
    if (b.dataset.title) { const x = X(); x.title = x.title === b.dataset.title ? "" : b.dataset.title; ctx.save(); ctx.rpg.refresh && ctx.rpg.refresh(); ctx.onTitle && ctx.onTitle(); return true; }
    return false;
  }
  const title = () => { const x = X(); if (x.title === "season" && x.stitle) return T("Season Star"); const a = ACH.find((y) => y.id === x.title); return a ? T(a.title) : ""; };
  const titleBonus = () => { const x = X(); return (x.title === "season" ? (x.stitle ? TITLE_BONUS.season : null) : x.ach.includes(x.title) ? TITLE_BONUS[x.title] : null) || null; };
  const hasPet = () => !!activePet();
  const petName = (id) => { const x = X(); return ((x.petName || {})[id] || "").slice(0, 12); };
  const pet = () => { const id = activePet(); return id ? { id, lv: petLevel(X().petXp[id] || 0), name: petName(id) } : null; };
  const seasonPending = () => { const x = X(); return SEASON_TIERS.filter((t, i) => x.ss.pts >= t.pts && !x.ss.got.includes(i)).length; };
  const pending = () => { const x = X(); return todays().filter((q) => !x.d.done.includes(q.id) && (x.d.p[q.id] || 0) >= q.n).length + seasonPending(); };
  return { on, html, click, title, titleBonus, titleOf, hasPet, pet, pending, bump, setTab: (t) => { tab = t; }, setRank: (k) => { rk = k; top = null; race = null; }, dir: () => dir, loadDir: async () => { rk = rk; const k = rk; rk = "players"; await loadTop(); rk = k; return dir; }, seasonNotice, petThumb: (id) => (ctx.petThumb ? ctx.petThumb(id) : "") };
}

/// the companions (world-rpg-data.js PETS): the drone floats by your shoulder and zaps the nearest scammer, the cat
/// trots at your heels and pulls street items in from farther, the Arc wisp circles you and mends a little HP.
/// Each grows with the knock-outs it sees (level 1–10): a stronger zap, a wider pull, a bigger mend.
export function createPet({ THREE, K, planet, here, facing, combat, reduce }) {
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
  // new looks at level 5 (an antenna, a scarf, a third ring) and golden at level 10
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xb07a10, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.25 });
  { const ant = new THREE.Group(), rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 6), std(0xdfe6ee)), tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 1.4) })); rod.position.y = 0.38; tip.position.y = 0.55; ant.add(rod, tip); ant.visible = false; drone.add(ant); drone.userData.extra = ant; drone.userData.skin = [drone.children[0]]; }
  { const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 8, 20), std(0xff4d6d)); scarf.position.set(0, 0.47, 0.24); scarf.rotation.x = Math.PI / 2; scarf.visible = false; cat.add(scarf); cat.userData.extra = scarf; cat.userData.skin = cat.children.filter((c) => c.material && c.material.color && c.material.color.getHex() === 0xffb35c); }
  { const r3 = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 40), new THREE.MeshBasicMaterial({ color: 0xffc861 })); r3.rotation.z = Math.PI / 3; r3.visible = false; wisp.add(r3); wisp.userData.extra = r3; wisp.userData.skin = [wisp.children[0]]; }
  const looks = { drone, cat, wisp };
  Object.values(looks).forEach((x) => { x.userData.skinMat = x.userData.skin.map((m) => m.material); });
  Object.values(looks).forEach((g) => { g.visible = false; root.add(g); });
  const me = new THREE.Vector3(), want = new THREE.Vector3(), last = new THREE.Vector3();
  let cur = null, g = null, actT = 4, lv = 1, name = "", plate = null, emoteT = 0, idleT = 0;
  function dress() {
    if (!g) return;
    g.userData.extra.visible = lv >= 5;
    g.userData.skin.forEach((m, i) => { m.material = lv >= 10 ? gold : g.userData.skinMat[i]; });
    if (plate) { plate.parent && plate.parent.remove(plate); plate.material.map && plate.material.map.dispose(); plate = null; }
    if (K && name) { plate = K.label(name, { accent: lv >= 10 ? "#ffc861" : "#9fffd0", size: 0.28, sub: "Lv " + lv }); plate.position.y = cur === "cat" ? 1.15 : 0.85; g.add(plate); }
  }
  return {
    /// p: { id, lv, name } or null
    set(p) {
      const id = p && looks[p.id] ? p.id : null, lv0 = lv, n0 = name, c0 = cur; lv = (p && p.lv) || 1; name = (p && p.name) || "";
      if (cur !== id) { if (plate && g) g.remove(plate); plate = null; Object.values(looks).forEach((x) => { x.visible = false; }); cur = id; g = id ? looks[id] : null; if (g) { here(me); g.position.set(me.x, me.y + (id === "cat" ? 0 : 2), me.z); g.visible = true; } }
      if (g && (c0 !== cur || lv0 !== lv || n0 !== name || !plate === !!name)) dress();
      if (g && c0 === cur && lv > lv0 && lv0) emoteT = 1.2; // it grew: a little show
    },
    /// a little show when you emote: the drone spins, the cat hops, the wisp flares
    emote() { emoteT = 1; },
    id: () => cur, level: () => lv, visible: () => !!(g && g.visible),
    /// portraits of the three companions (rendered once, on first ask): { drone, cat, wisp } → data URLs
    portraits() {
      if (this._pics) return this._pics;
      const out = {}; let r = null;
      try {
        r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(96, 96); r.outputColorSpace = THREE.SRGBColorSpace;
        const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.4)); const dl = new THREE.DirectionalLight(0xffffff, 1.8); dl.position.set(2, 3, 4); sc.add(dl);
        const cm = new THREE.PerspectiveCamera(32, 1, 0.05, 20);
        for (const [id, look] of Object.entries(looks)) {
          const c = look.clone(true); c.visible = true; c.position.set(0, 0, 0); c.rotation.set(0, id === "cat" ? 0.6 : 0.3, 0); c.children.forEach((k) => { if (k.isSprite) k.visible = false; });
          sc.add(c); const y = id === "cat" ? 0.42 : 0; cm.position.set(0.9, y + 0.45, 1.5).multiplyScalar(id === "cat" ? 1.1 : 0.85); cm.lookAt(0, y, 0);
          r.render(sc, cm); out[id] = r.domElement.toDataURL("image/png"); sc.remove(c);
        }
      } catch { /* the drawn icons stay */ }
      if (r) { r.dispose(); r.forceContextLoss(); }
      this._pics = out; return out;
    },
    debug: () => ({ id: cur, lv, name, plate: !!plate, extra: !!(g && g.userData.extra.visible), gold: !!(g && g.userData.skin[0].material === gold) }),
    /// how far the companion pulls street items in (the cat pulls farther as it grows)
    pull: () => (cur === "cat" ? 6 + lv * 0.5 : cur ? 4.5 : 0),
    zapNow: () => !!(cur === "drone" && combat && combat.petZap && combat.petZap(g.position, 1 + 0.12 * (lv - 1))),
    tick(dt, t, inHub) {
      if (!g || !g.visible) return;
      here(me); const f = facing();
      if (emoteT > 0) { emoteT = Math.max(0, emoteT - dt); const k = 1 - emoteT; if (cur === "cat") g.userData.hop = Math.sin(k * Math.PI * 2) * 0.35; else if (cur === "drone") g.rotation.x = k * Math.PI * 2; else g.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.6); } else { g.userData.hop = 0; g.rotation.x = 0; if (cur === "wisp") g.scale.setScalar(1); }
      if (cur === "cat") {
        want.set(me.x - Math.sin(f) * 1.2 + Math.cos(f) * 0.6, me.y, me.z - Math.cos(f) * 1.2 - Math.sin(f) * 0.6);
        last.copy(g.position);
        if (g.position.distanceToSquared(want) > 400) g.position.copy(want); else g.position.lerp(want, 1 - Math.exp(-dt * 4));
        const sp = last.distanceTo(g.position) / Math.max(1e-3, dt), moving = sp > 0.4;
        if (moving) g.rotation.y = Math.atan2(g.position.x - last.x, g.position.z - last.z);
        const u = g.userData; u.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(t * 14 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 : 0; });
        u.tail.rotation.z = Math.sin(t * (moving ? 8 : 2.5)) * 0.4; u.head.rotation.y = moving ? 0 : Math.sin(t * 0.8) * 0.4;
        // left alone a moment it sits down, and now and then it yawns (head back) or licks a paw (head down)
        idleT = moving ? 0 : idleT + dt; const sit = reduce ? 0 : Math.min(1, Math.max(0, (idleT - 2) * 2));
        g.children[0].rotation.x = -0.45 * sit; g.children[0].position.y = 0.32 - 0.06 * sit; u.legs[2].position.y = u.legs[3].position.y = 0.1 - 0.04 * sit;
        const yawn = sit >= 1 ? Math.max(0, Math.sin(((idleT - 3) % 9) / 1.4 * Math.PI)) * (((idleT - 3) % 9) < 1.4 ? 1 : 0) : 0; u.head.rotation.x = -0.35 * yawn;
        g.position.y = me.y + (moving ? Math.abs(Math.sin(t * 14)) * 0.05 : 0) + Math.max(0, g.userData.hop || 0);
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
