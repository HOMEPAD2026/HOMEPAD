// tests/world/fest.test.mjs — the Starter Festival (api/_world-fest.mjs): only a NEW member (first save during the festival)
// takes it, once; 5× EXP for 3 days, 500 + 500 potions, the Starwhale, the Starlight Blade + Armor (Legendary +7, worn from Lv 10).
import fs from "node:fs";
const { FEST, makeFest, festOpen } = await import("../../api/_world-fest.mjs");
const { TIERS, parseBase, PET_BY, UNIQUE, itemName } = await import("../../world-rpg-data.js");
const { PET_GIFT } = await import("../../api/_world-shop.mjs");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log("PASS", m); } else { fail++; console.log("FAIL", m); } };

const db = {}; let T = FEST.start + 3600e3, n = 0;
const deps = {
  getDocs: async (ps) => Object.fromEntries(ps.map((p) => [p, db[p] ? JSON.parse(JSON.stringify(db[p])) : undefined])),
  setDoc: async (p, d) => { db[p] = JSON.parse(JSON.stringify(d)); },
  commit: async (ops) => { for (const o of ops) if (o.create && db[o.create]) return { ok: false }; for (const o of ops) if (o.create) db[o.create] = o.data; return { ok: true }; },
  json: (status, body) => ({ status, body }), now: () => T, signer: (b) => (b.wallet ? { wallet: b.wallet } : { err: { status: 401 } }),
  own: async (w) => db[`worldOwn/${w}`] || {}, petMax: 30, rid: () => "r" + (++n).toString(36).padStart(12, "0"),
};
const F = makeFest(deps), A = "0xaaa", B = "0xbbb";

ok(festOpen(FEST.start) && !festOpen(FEST.end) && FEST.DAYS === 3 && FEST.XP_K === 5 && FEST.HP === 500 && FEST.SP === 500, "3 days of 5× EXP, 500 + 500 potions, inside the festival's window");
// an old member (no first save during the festival) can't take it
let r = await F.handle({ action: "world-fest-claim", wallet: B });
ok(r.status === 403, "an account that was already playing isn't a new member");
await F.markNew(A);
r = (await F.view(A)).body; ok(r.eligible && r.isNew && !r.claimed && r.gift.wearLv === 10, "a first save during the festival makes a new member, and the card offers the gift");
r = await F.handle({ action: "world-fest-claim", wallet: A });
ok(r.status === 200 && r.body.until === T + 3 * 864e5 && r.body.pet && r.body.hp === 500 && r.body.sp === 500, "the claim: 5× until 3 days on, the pet, the potions");
const o = db[`worldOwn/${A}`];
ok(o.pets.list[0].s === "starwhale" && PET_GIFT.starwhale === 4 && PET_BY.starwhale && PET_BY.starwhale.r === 4 && PET_BY.starwhale.glb, "the Legendary Starwhale is in the pet list (a gift pet with its Meshy model)");
const its = o.fest.gifts[0].items;
ok(its.length === 2 && its.every((it) => it.r === 4 && it.p === FEST.PLUS && TIERS[parseBase(it.b).tier].lv === 10), "the blade and the armor: Legendary +7, worn from level 10");
ok(its[0].b.startsWith("weapon-") && its[0].u === "starb" && its[1].b.startsWith("armor-") && its[1].u === "stara" && itemName(its[0]).startsWith(UNIQUE.starb) && itemName(its[1]).startsWith("Starlight Armor"), "named the Starlight Blade and the Starlight Armor");
ok(F.xpK(o) === 5, "the server's XP allowance rises 5× while it runs");
r = await F.handle({ action: "world-fest-claim", wallet: A }); ok(r.status === 409, "once a wallet");
T += 3 * 864e5 + 1; ok(F.xpK(db[`worldOwn/${A}`]) === 1, "after 3 days the 5× ends");
// a new member who waits more than 7 days gets nothing
T = FEST.start + 7200e3; await F.markNew(B); T += 8 * 864e5; r = await F.handle({ action: "world-fest-claim", wallet: B }); ok(r.status === 403, "the gift waits 7 days after joining");
// the save keeps the festival's pieces (api/_world.mjs cleanItem), the game takes each gift once (world-play.js festOwn)
const world = fs.readFileSync(new URL("../../api/_world.mjs", import.meta.url), "utf8"), play = fs.readFileSync(new URL("../../world-play.js", import.meta.url), "utf8");
ok(/x\.u === "starb" && String\(x\.b\)\.startsWith\("weapon-"\)\) \|\| \(x\.u === "stara" && String\(x\.b\)\.startsWith\("armor-"\)\)/.test(world), "a save keeps the u of the Starlight pieces");
ok(/fest\.xpK\(ownB\)/.test(world) && /else await fest\.markNew\(s\.wallet\)/.test(world), "the save's XP pace and the first-save mark use the festival");
ok(/if \(festUntil > t\) k \*= 5/.test(play) && /function festOwn\(o\)/.test(play) && /r\.x\.fg/.test(play), "the game's EXP ×5 and the gifts taken once each");
for (const f of ["models/world/fest/starblade.glb", "models/world/fest/stararmor.glb", "models/world/fest/starwhale.glb", "images/fest/key-wide-960.webp", "images/fest/icon-xp5.webp", "images/fest/icon-whale.webp", "images/fest/icon-blade.webp", "images/fest/icon-armor.webp", "images/fest/icon-potions.webp"]) {
  const p = new URL("../../" + f, import.meta.url); ok(fs.existsSync(p) && fs.statSync(p).size < 700e3, f + " is there and phone-sized");
}
// ARCIA promotes it (the owner, 2026-11-05): her own slot with the festival post's link, the hourly topic, replies / Telegram links
{
  const W = await import("../../api/_arcia-world.mjs"), X = await import("../../api/arcia-x.mjs");
  ok(W.FEST_POST === "https://x.com/ARCIRCLEonArc/status/2118123667997729201" && W.HOUR_TOPICS.some((t) => t.k === "fest"), "ARCIA has the festival post and an hourly festival topic");
  ok(/🎁 https:\/\/x\.com\/ARCIRCLEonArc\/status\/2118123667997729201/.test(W.withLinks("The Starter Festival is on for new members!")) && /2118123667997729201/.test(W.withLinks("스타터 페스티벌 선물 받으세요")) && !/2118123667997729201/.test(W.withLinks("KART race now")), "a reply about the festival carries its link (one link), others don't");
  ok(X.festOn(FEST.start + 3600e3) && !X.festOn(X.FEST_PROMO_END) && X.FEST_EVERY === 60 && X.festSlot(FEST.start + 15 * 60e3) !== X.festSlot(FEST.start + 14 * 60e3), "her festival post every hour at :15, the first week");
  const xl = (t) => { let n = 0; for (const c of String(t).replace(/https?:\/\/\S+/g, "x".repeat(23))) { const cp = c.codePointAt(0); n += (cp >= 0x1100 && cp <= 0xffef) || cp > 0xffff ? 2 : 1; } return n; };
  ok(Object.values(X.FEST_FALLBACK).flat().every((t) => xl(t + "\n\n🎁 " + W.FEST_POST) <= 278) && Object.keys(X.FEST_FALLBACK).length === 5, "the five languages' fallbacks fit X with the link");
  ok(/fest = topic\.k === "fest"/.test(fs.readFileSync(new URL("../../api/arcia-x.mjs", import.meta.url), "utf8")), "the hourly festival topic takes the festival post's link");
}
console.log(`${pass} pass ${fail} fail`); if (fail) process.exit(1);
