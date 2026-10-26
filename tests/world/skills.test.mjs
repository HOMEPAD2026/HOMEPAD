// The high skills (2026-10-26): Lv 150–350, skill level up to 10, the X slot and the C ultimate, the hero's clips.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const D = await import(path.join(ROOT, "world-rpg-data.js"));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };
ok(D.SKILL_MAX === 10 && D.skillLevel(150, 150) === 1 && D.skillLevel(195, 150) === 10 && D.skillLevel(500, 10) === 10 && D.skillLevel(149, 150) === 0, "a skill grows to level 10, a level every 5");
ok(Math.abs(D.skillDmgK(1) - 1) < 1e-9 && Math.abs(D.skillDmgK(5) - 1.48) < 1e-9 && Math.abs(D.skillDmgK(10) - 1.88) < 1e-9, "damage: +12% a level to 5 (as before), then +8%");
ok(Math.abs(D.skillCdK(5) - 0.8) < 1e-9 && Math.abs(D.skillCdK(9) - 0.8) < 1e-9 && Math.abs(D.skillCdK(10) - 0.68) < 1e-9, "cooldown: −5% a level to 5, −15% more at 10");
const ids = ["blade", "chrono", "void", "judge", "infinity"];
ok(ids.every((id) => D.SKILL_INFO.some((k) => k.id === id) && D.BRANCHES[id] && D.BRANCHES[id].length === 2 && D.SKILL_LINE[id]), "each high skill has its info, two branches and a line");
ok(D.SKILL_INFO.filter((k) => k.ult).map((k) => k.lv).join() === "300,350" && D.SLOT2_LV === 150 && D.ULT_LV === 300, "X at 150, the ultimates at 300 and 350");
// world-skills.js can't load here (it needs three.js), so its source is read: the ids and levels match, and every clip is a CU_AS one
const src = fs.readFileSync(path.join(ROOT, "world-skills.js"), "utf8");
const high = [...src.matchAll(/\{ id: "(\w+)", name: "[^"]+", lv: (\d+)/g)].map((m) => [m[1], +m[2]]);
ok(high.length === 5 && high.every(([id, lv]) => D.SKILL_INFO.find((k) => k.id === id && k.lv === lv)), "world-skills.js HIGH matches SKILL_INFO");
const kit = fs.readFileSync(path.join(ROOT, "world-kit.js"), "utf8"), cuAs = kit.match(/CU_AS\s*=\s*\{([\s\S]*?)\};/);
const keys = new Set(cuAs ? [...cuAs[1].matchAll(/"?([\w-]+)"?\s*:/g)].map((m) => m[1]) : []);
const used = [...src.matchAll(/clip\((?:Math\.random\(\) < 0\.5 \? |[^"(]*\? )?"([\w-]+)"(?: : "([\w-]+)")?/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean);
ok(keys.size > 10 && used.length >= 8 && used.every((c) => keys.has(c)), `every clip the skills play is a CU_AS one (${[...new Set(used)].join(", ")})`);
ok(!/play\("run"/.test(src) && !/clip\("run"/.test(src), "no 'run' clip");
console.log(`${pass} pass ${fail} fail`); process.exit(fail ? 1 : 0);
