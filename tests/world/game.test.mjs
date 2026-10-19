// game.test.mjs — the game's pure rules (no browser): the season, the quiz, fusion, the raid's twist, its calendar, the codex.
// Run: node tests/world/game.test.mjs
import { seasonOf, tierOf, SEASON_TIERS, quizFor, QUIZ } from "../../world-season.js";
import { fuseResult, FUSE_MAX_R, xpNeed, xpAt, levelOfXp, xpFromOld, xpProgress, mobStats, itemStats, temperCost, ZONES, pondOf, xpEvent, xpBoost, goldenRush } from "../../world-rpg-data.js";
import * as SRV from "../../api/_world-social.mjs";
import { RAID_MODS, raidModOf, raidIcs, phaseOf } from "../../world-social.js";
import { CODEX, CODEX_STORY, dailyHunts } from "../../world-quests.js";
import { raidMax, nextWeekAt } from "../../api/_world-social.mjs";
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };

// the season: 28 days from Monday 5 October 2026 (Seoul), ten tiers in rising order
const s1 = seasonOf(Date.UTC(2026, 9, 10)), s2 = seasonOf(s1.ends + 1000);
check(s1.id === 1 && s2.id === 2 && s2.start === s1.ends, "seasons follow each other without a gap");
check(SEASON_TIERS.every((t, i) => !i || t.pts > SEASON_TIERS[i - 1].pts), "tiers need more points each");
check(tierOf(0) === 0 && tierOf(SEASON_TIERS[9].pts) === 10, "tierOf counts the tiers reached");
check(SEASON_TIERS.every((t) => t.kind !== "arcl"), "season rewards are never ARCL");

// the quiz: five different questions a day, the same for everyone, each with a valid answer and an explanation
for (const day of ["2026-10-11", "2026-10-12", "2027-01-01"]) {
  const q = quizFor(day);
  check(q.length === 5 && new Set(q.map((x) => x.i)).size === 5, `${day}: five different questions`);
  check(q.every((x) => x.right >= 0 && x.right < 3 && x.opts[x.right] === QUIZ[x.i].a && x.why), `${day}: the right answer is where it says, with why`);
  check(JSON.stringify(q) === JSON.stringify(quizFor(day)), `${day}: the same set for everyone`);
}

// fusion: three of a rarity into one of the next, the slot picked when asked
const three = [["ring", 1], ["helm", 2], ["boots", 1]].map(([sl, t], i) => ({ id: "x" + i, b: `${sl}-${t}`, r: 0, lv: 5 + i, p: 0 }));
const f = fuseResult(three, 0.9, "helm");
check(f && f.r === 1 && f.lv === 7, "three commons fuse into an uncommon at the highest level");
check(f && f.b === "helm-2", "the picked slot is used, at the highest tier");
check(fuseResult(three, 0, "weapon").b.startsWith("ring"), "a slot none of them has falls back to the roll");
check(fuseResult(three.map((x) => ({ ...x, r: FUSE_MAX_R + 1 })), 0.5) == null, "fusion above the cap is refused");
check(fuseResult([three[0], three[1], { ...three[2], r: 1 }], 0.5) == null, "mixed rarities are refused");

// the raid: phases at 75 / 50 / 25 %, a twist per week the same for everyone, a weekly calendar reminder
check(phaseOf(100, 100) === 1 && phaseOf(70, 100) === 2 && phaseOf(40, 100) === 3 && phaseOf(10, 100) === 4 && phaseOf(0, 100) === 5, "phases split the HP in quarters");
check(RAID_MODS.length >= 4 && new Set(RAID_MODS.map((m) => m.id)).size === RAID_MODS.length, "the twists have different ids");
check(raidModOf("2026-W41").id === raidModOf("2026-W41").id && RAID_MODS.includes(raidModOf("2026-W42")), "a week always gets the same twist");
const weeks = new Set(); for (let w = 1; w <= 52; w++) weeks.add(raidModOf("2027-W" + String(w).padStart(2, "0")).id);
check(weeks.size === RAID_MODS.length, "over a year every twist comes up");
const ics = raidIcs(Date.UTC(2026, 9, 11, 3));
check(/^BEGIN:VCALENDAR\r\n/.test(ics) && /RRULE:FREQ=WEEKLY/.test(ics) && /DTSTART:20261012T030000Z/.test(ics), "the reminder is weekly, Mondays at noon in Seoul");
check(new Date(nextWeekAt(Date.UTC(2026, 9, 11, 3))).toISOString() === "2026-10-11T15:00:00.000Z", "the next week starts Monday 00:00 in Seoul");
check(raidMax(0) === 500000 && raidMax(1) === 200000 && raidMax(1000) === 2000000 && raidMax(40) === 1000000, "the raid's HP follows last week's raiders, clamped");

// levels: a rising curve, the same on the server, and old saves keep their level
check(xpNeed(1) === 100 && xpNeed(10) > 400 && xpNeed(20) > 900 && xpNeed(80) > 8000, "each level needs more XP than the last");
check([2, 5, 10, 25, 40, 80, 199, 200, 201, 350, 500].every((l) => levelOfXp(xpAt(l)) === l && levelOfXp(xpAt(l) - 1) === l - 1), "levelOfXp and xpAt agree at every boundary");
{ const R = await import("../../world-rpg-data.js"); let steps = true; for (let l = 1; l < 500; l++) if (xpAt(l + 1) - xpAt(l) !== xpNeed(l)) steps = false;
  check(R.LV_MAX === 500 && levelOfXp(R.XP_MAX + 1e9) === 500 && steps && xpNeed(200) - xpNeed(199) < 500 && xpNeed(300) - xpNeed(299) === 150, "levels go to 500; past 200 each costs 150 XP more than the last");
  check(xpAt(200) === 3218029 && xpAt(49) === 74360, "levels up to 200 cost what they always did"); }
check([0, 99, 100, 1250, 2499, 7999, 19899].every((x) => levelOfXp(xpFromOld(x)) === 1 + Math.floor(x / 100)), "converting an old save keeps its level");
check(xpProgress(xpFromOld(1250)).into === Math.floor(0.5 * xpNeed(13)), "and the share of the level already done");
check([1, 7, 33, 90].every((l) => SRV.xpAt(l) === xpAt(l) && SRV.xpNeed(l) === xpNeed(l)) && SRV.levelOfSave({ xp: 2450 }) === 25 && SRV.levelOfSave({ xp: xpAt(25), xpv: 2 }) === 25, "the server uses the same curve and reads old saves the old way");
{ const kills = (l) => xpNeed(l) / mobStats(l).xp; check(kills(5) >= 4 && kills(20) > 10 && kills(80) < 50, "about " + [5, 20, 40, 80].map((l) => Math.round(kills(l))).join(" / ") + " knock-outs of your own level per level at 5 / 20 / 40 / 80"); }
// the codex: twenty-two pages (the far ring's seven bosses too), each with how to beat the scam
const all = [...CODEX_STORY, ...CODEX];
check(all.length === 22 && new Set(all.map((c) => c.id)).size === 22, "twenty-two pages with their own ids");
check(all.every((c) => c.name && c.line && c.beat), "every page says how the scam works and how to beat it");
check(CODEX_STORY.every((c) => ["phisher", "airdrop", "honeypot", "doppel", "golem", "dragon"].includes(c.story)), "the story pages follow the six scammers");

// tempering: each stage adds 4% to the weapon; the cost grows with the stage
{ const a = itemStats({ b: "weapon-2", r: 1, lv: 20, p: 0 }).atk, b = itemStats({ b: "weapon-2", r: 1, lv: 20, p: 0, tm: 5 }).atk;
  check(b > a && Math.abs(b / a - 1.2) < 0.05, "five temper stages add about 20% attack " + a + " → " + b);
  check(temperCost(2).ore === 2 * temperCost(1).ore && temperCost(5).scrap === 100, "temper costs grow by the stage"); }
// the far grounds' ponds sit inside their ground, clear of the gate side
{ const far = ZONES.filter((z) => z.lv[0] >= 30); check(far.every((z) => { const p = pondOf(z); return p && Math.hypot(p.x - z.x, p.z - z.z) + p.r < z.r - 2; }), "each far ground has a pond inside it");
  check(ZONES.filter((z) => z.lv[0] < 30).every((z) => !pondOf(z)), "the near grounds have none"); }
// every boss has its saying
check(ZONES.every((z) => z.boss && z.boss.line && z.boss.line.length < 60), "every boss has a short saying");

// the weekday events: a near ground and a far one; the weekend everywhere, with the golden rush
{ const mon = Date.UTC(2026, 9, 12, 3), sat = Date.UTC(2026, 9, 17, 3); const e = xpEvent(mon);
  check(e.zone === "spam" && e.far === "peaks" && xpBoost("peaks", mon) === 1.5 && xpBoost("reef", mon) === 1 && goldenRush(mon) === 1, "Monday: Spam Alley and Ponzi Peaks");
  check(xpEvent(sat).all && xpBoost("void", sat) === 1.5 && goldenRush(sat) === 3, "the weekend: everywhere, golden scammers three times as often"); }

// the daily hunts: every day gives three different hunts and a village one, never an empty slot (2026-10-20's hash is
// ≥ 2³¹: a signed shift gave a negative index, an undefined hunt, and the town stuck at 75% for everyone)
{ let badDay = ""; const t0 = Date.UTC(2026, 0, 1); for (let d = 0; d < 3660 && !badDay; d++) { const day = new Date(t0 + d * 864e5).toISOString().slice(0, 10), h = dailyHunts(day); if (h.length !== 4 || !h.every((q) => q && q.id && q.ev && q.n > 0) || new Set(h.slice(0, 3)).size !== 3) badDay = day; }
  check(!badDay, "daily hunts: ten years of days, each with 3 different hunts + 1 village hunt" + (badDay ? " (broken: " + badDay + ")" : "")); }
check(dailyHunts("2026-10-20").length === 4 && dailyHunts("2026-10-20").every(Boolean) && JSON.stringify(dailyHunts("2026-10-19")) === JSON.stringify(dailyHunts("2026-10-19")), "2026-10-20 has real hunts; a day's hunts are the same each time");
console.log(ok, "pass", bad, "fail");
if (bad) process.exit(1);
