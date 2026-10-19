// contract.test.mjs — every World view and action the game asks for is one the server answers, and /api/social passes
// it on. The browser tests stand in for /api/social, so a gap between the two only shows here.
// Run: node tests/world/contract.test.mjs
import fs from "node:fs";
const root = new URL("../../", import.meta.url).pathname;
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log("PASS", m); } else { bad++; console.log("FAIL", m); } };
const read = (f) => fs.readFileSync(root + f, "utf8");
const client = fs.readdirSync(root).filter((f) => /^world-.*\.js$/.test(f)).map(read).join("\n");
const server = ["api/_world.mjs", "api/_world-shop.mjs", "api/_world-social.mjs", "api/_world-support.mjs", "api/_world-crew.mjs", "api/_world-village.mjs", "api/_world-chat.mjs", "api/_world-rank.mjs", "api/_world-defense.mjs", "api/_world-jump.mjs", "api/_world-welcome.mjs", "api/_world-survivors.mjs", "api/_world-rings.mjs", "api/_world-poker.mjs", "api/_world-dino.mjs", "api/_world-launch.mjs", "api/_world-refer.mjs"].map(read).join("\n");
const social = read("api/social.mjs");
const views = [...new Set([...client.matchAll(/api\/social\?world=([a-z0-9-]+)/g)].map((m) => m[1]))];
const actions = [...new Set([...client.matchAll(/action: "(world-[a-z0-9-]+)"/g)].map((m) => m[1]))];
check(views.length > 10 && actions.length > 10, `found ${views.length} views and ${actions.length} actions in the game`);
for (const v of views) check(new RegExp(`(view|w|v) === "${v}"`).test(server), `the server answers ?world=${v}`);
for (const a of actions) check(server.includes(`"${a}"`), `the server handles ${a}`);
// /api/social: World reads and actions are passed on by pattern, not by a list that has to be kept in step
const getRule = /\^\[a-z\]\[a-z0-9-\]\{1,30\}\$\/\.test\(url\.searchParams\.get\("world"\)/.test(social);
const postRule = /\/\^world-\[a-z\]\[a-z0-9-\]\{1,30\}\$\/\.test\(String\(b\.action\)\)\) return await world\(\)\.handle\(b\)/.test(social);
check(getRule, "/api/social passes every ?world= view to the World API");
check(postRule, "/api/social passes every world-* action to the World API");
for (const v of views) check(/^[a-z][a-z0-9-]{1,30}$/.test(v), `?world=${v} fits the pattern`);
for (const a of actions) check(/^world-[a-z][a-z0-9-]{1,30}$/.test(a), `${a} fits the pattern`);
console.log(ok, "pass", bad, "fail"); process.exit(bad ? 1 : 0);
