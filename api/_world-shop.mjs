// api/_world-shop.mjs — ARCIRCLE World's economy: ARCL (the in-game points), the shop, and $ARCIRCLE payments.
//
// ARCL is earned only for things the server can check (a daily check-in, beating a scammer stage, holding $ARCIRCLE,
// launching a coin, an island that grew, likes other wallets gave, stamps left for others), at most DAILY_CAP a day.
// It's spent on cosmetics. It can't be bought, and it can't be exchanged yet: EXCHANGE.open stays false until the rate
// and rules are set (then one switch here, plus a claim contract that gets audited first).
//
// $ARCIRCLE payments: the player's own wallet sends $ARCIRCLE to ArcircleFeeBurn (a plain ERC-20 transfer they sign).
// The server checks the receipt (a Transfer of at least the quoted amount, from that wallet, to FeeBurn, not used
// before) and grants the item. FeeBurn's flush — run hourly by api/_orders.mjs — burns 50% (burnBps 5000) and sends
// the rest to the ARCIRCLE PAD treasury; neither can change. Prices are in USD, quoted in $ARCIRCLE for 10 minutes.
//
//   GET  ?world=shop[&wallet=]   catalog, prices, what the wallet owns, the plaza, FeeBurn, the exchange settings
//   GET  ?world=arcl&wallet=      the wallet's ARCL: balance, today, streak, what's been earned, history
//   GET  ?world=arcl-top          this week's top earners
//   GET  ?world=plaza             the featured island and the coin on the plaza billboard right now
//   GET  ?world=hunt-top          this week's top hunters (points from counted knock-outs)
//   GET  ?world=drops             the last Epic and Legendary finds
//   POST world-sell { …signature, item }                          sell a piece to the Forge (by rarity, 150 a day)
//   POST world-feed-drop { …signature, b, r }                    put a find in the feed (1 a minute, 10 a day)
//   POST world-arcl-claim { …signature, kind, answer?, coin? }    earn (each kind checked here)
//   POST world-arcl-spend { …signature, item, target? }          buy with ARCL
//   POST world-pay-quote  { …signature, item, target? }          a $ARCIRCLE price, good for 10 minutes
//   POST world-pay-confirm { …signature, quote, tx }             the receipt → the item
//   POST world-arcl-notify { …signature, on }                     tell me when the exchange opens
// Firestore: worldArcl/<w> · worldArclOnce/<w>_<kind> · worldArclDay/<w>_<day> · worldArclWeek/<week>_<w> · worldOwn/<w>
//            worldPayQuote/<id> · worldPayTx/<hash> · worldStats/plaza · worldStats/arclWeek_<week> · worldArclNotify/<w>
import { xpLevel } from "./_world-village.mjs"; // the village level from its XP
import { levelOfSave } from "./_world-social.mjs"; // the level from a save, on whichever XP curve it is
const lc = (a) => String(a || "").toLowerCase();
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const pad32 = (a) => "0x" + lc(a).replace(/^0x/, "").padStart(64, "0");
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const ARCIRCLE = "0xe5718f298ac3b65faf7c711b56cbd72b3bb15ff7";
export const FEE_BURN = "0x7f53f5014bc2cfe52ed8fb9370f2bcd497b93034"; // ArcircleFeeBurn on Arc: burnBps 5000, treasury 0xa066…02F8
export const DAILY_CAP = 30000; // b383: from 300; each activity keeps its own daily limit (EARN) underneath it
export const QUOTE_MS = 10 * 60e3;
// the exchange: nothing is decided yet — the page shows these as "not set"
export const EXCHANGE = { open: false, rate: null, minClaim: null, startsAt: null, budget: null };

// what ARCL is earned for (each checked in claim())
export const EARN = [
  { kind: "daily", n: 20, label: "Daily check-in", more: "+5 a day of streak, up to +30" },
  ...["phisher", "airdrop", "honeypot", "doppel", "golem", "dragon"].map((id, i) => ({ kind: "stage:" + id, n: 30, label: `Beat scammer stage ${i + 1}` })),
  { kind: "hold", n: 50, label: "Hold $ARCIRCLE" },
  { kind: "launch", n: 100, label: "Launch a coin on ArcPad" },
  { kind: "isle20", n: 20, label: "Island: 20 bricks" }, { kind: "isle100", n: 40, label: "Island: 100 bricks" }, { kind: "isle300", n: 80, label: "Island: 300 bricks" },
  { kind: "res1", n: 30, label: "Island: first resident" }, { kind: "res5", n: 60, label: "Island: 5 residents" },
  { kind: "vill2", n: 50, label: "Village centre: level 2" },
  { kind: "vquest9", n: 0, label: "Island tutorial: a free pet egg", more: "once, after the whole chain" },
  { kind: "liked1", n: 10, label: "A like from another player" }, { kind: "liked10", n: 40, label: "10 likes" }, { kind: "liked50", n: 120, label: "50 likes" },
  { kind: "stamp", n: 5, label: "Leave a stamp on someone's island", more: "up to 3 a day" },
  // the streets: the server can't watch a fight, so these are small, limited per day and spaced out
  { kind: "street", n: 5, label: "Knock out a street scammer", more: "up to 100 a day", repeat: { max: 100, gap: 12 } },
  { kind: "pickup", n: 2, label: "Pick up an ARCL coin in the street", more: "up to 100 a day", repeat: { max: 100, gap: 6 } },
  { kind: "hunt", n: 8, label: "Knock out a scammer in a hunting ground", more: "5–12 by its level, up to 100 a day", repeat: { max: 100, gap: 10 } },
  { kind: "sell", n: 0, label: "Sell gear at the Forge", more: "6–260 by rarity, up to 1,500 a day" },
  { kind: "boss", n: 30, label: "Beat a hunting-ground boss", more: "up to 30 a day", repeat: { max: 30, gap: 240 } },
  { kind: "raid", n: 40, label: "Help bring down the weekly raid boss", more: "once a week, after it falls", weekly: true },
];
const EARN_BY = Object.fromEntries(EARN.map((e) => [e.kind, e]));
// the scammer stages: the answer that beats each (the game's FIGHTS)
const STAGE_WIN = { phisher: 1, airdrop: 1, honeypot: 1, doppel: 1, golem: 1, dragon: 1 };

// the shop. usd: price in $ARCIRCLE (quoted at the time); arcl: price in ARCL (null = $ARCIRCLE only)
export const CATALOG = [
  // island styles: the island's look — ground, cliffs, waterfalls, trees around the edge, the sea and the sky
  { id: "style-grass", cat: "island", name: "Grass Island", line: "A cozy island full of greenery.", usd: 5, arcl: 1500 },
  { id: "style-tropical", cat: "island", name: "Tropical Island", line: "Palm trees and crystal sea.", usd: 8, arcl: 2000 },
  { id: "style-stone", cat: "island", name: "Stone Island", line: "A grand island of ancient ruins.", usd: 10, arcl: 2500 },
  { id: "style-snow", cat: "island", name: "Snow Island", line: "A peaceful winter island.", usd: 12, arcl: 3000 },
  { id: "style-sakura", cat: "island", name: "Sakura Island", line: "Cherry blossoms in the sky.", usd: 12, arcl: 3000 },
  { id: "style-desert", cat: "island", name: "Desert Island", line: "A warm island under the sun.", usd: 20, arcl: 5000 },
  { id: "style-ocean", cat: "island", name: "Ocean Island", line: "Surrounded by the endless sea.", usd: 20, arcl: 5000 },
  { id: "style-aurora", cat: "island", name: "Aurora Island", line: "Green and purple lights in the sky.", usd: 40, arcl: 10000 },
  { id: "style-celestial", cat: "island", name: "Celestial Island", line: "A heavenly island above the clouds.", usd: 40, arcl: 10000 },
  { id: "style-volcano", cat: "island", name: "Volcano Island", line: "A powerful island of fire.", usd: 80, arcl: 20000 },
  { id: "isle48", cat: "island", name: "Island expansion 48×48", line: "More room: a 48×48 island.", usd: 3, arcl: 1500 },
  { id: "isle64", cat: "island", name: "Island expansion 64×64", line: "The biggest island: 64×64 and taller builds.", usd: 8, arcl: null, needs: "isle48" },
  // material bricks: each unlocks one brick in the builder
  { id: "brick-grass", cat: "bricks", name: "Grass Brick", line: "A natural base for your island.", usd: 0.5, arcl: 100 },
  { id: "brick-stone", cat: "bricks", name: "Stone Brick", line: "Strong and timeless.", usd: 1, arcl: 200 },
  { id: "brick-wood", cat: "bricks", name: "Wood Brick", line: "Warm and cozy.", usd: 1, arcl: 300 },
  { id: "brick-metal", cat: "bricks", name: "Metal Brick", line: "Modern and reliable.", usd: 2, arcl: 500 },
  { id: "brick-glass", cat: "bricks", name: "Glass Brick", line: "Let the light in.", usd: 3, arcl: 800 },
  { id: "brick-neon", cat: "bricks", name: "Neon Brick", line: "Light up your island.", usd: 4, arcl: 1000 },
  { id: "brick-crystal", cat: "bricks", name: "Crystal Brick", line: "A touch of magic.", usd: 8, arcl: 2000 },
  { id: "brick-gold", cat: "bricks", name: "Gold Brick", line: "Pure value.", usd: 20, arcl: 5000 },
  { id: "brick-cyber", cat: "bricks", name: "Cyber Brick", line: "Technology for tomorrow.", usd: 40, arcl: 10000 },
  { id: "brick-arcadia", cat: "bricks", name: "Arcadia Brick", line: "The ultimate decoration.", usd: 80, arcl: 20000 },
  // brick packs: a few themed pieces each
  { id: "pack-neon", cat: "bricks", name: "Neon City pack", line: "Glowing panels, neon signs, holo screens and a light pillar.", usd: 3, arcl: 800 },
  { id: "pack-ocean", cat: "bricks", name: "Ocean pack", line: "Sand, coral, a palm, a lighthouse.", usd: 3, arcl: 800 },
  { id: "pack-space", cat: "bricks", name: "Space Station pack", line: "Hull plates, portholes, an antenna and a satellite dish.", usd: 3, arcl: 800 },
  // style: how you look in the world
  { id: "plate-gold", cat: "style", name: "Gold name tag", line: "Your name in gold over your head.", usd: 1, arcl: 200 },
  { id: "plate-pink", cat: "style", name: "Pink name tag", line: "Your name in pink.", usd: 1, arcl: 200 },
  { id: "plate-green", cat: "style", name: "Green name tag", line: "Your name in ARCIRCLE green.", usd: 1, arcl: 200 },
  { id: "plate-purple", cat: "style", name: "Purple name tag", line: "Your name in purple.", usd: 1, arcl: 200 },
  { id: "plate-flame", cat: "style", name: "Flame name tag", line: "Your name in fiery orange.", usd: 2, arcl: 400 },
  { id: "trail-cyan", cat: "style", name: "Cyan board trail", line: "A cyan light trail behind your hoverboard.", usd: 1, arcl: 200 },
  { id: "trail-gold", cat: "style", name: "Gold board trail", line: "A gold trail behind your hoverboard.", usd: 1, arcl: 200 },
  { id: "trail-pink", cat: "style", name: "Pink board trail", line: "A pink trail behind your hoverboard.", usd: 1, arcl: 200 },
  { id: "trail-rainbow", cat: "style", name: "Rainbow board trail", line: "Every colour, cycling behind your hoverboard.", usd: 4, arcl: 1000 },
  // the old ARCL name change: no longer sold (a character change covers the name now); bought ones still work
  { id: "rename", cat: "retired", name: "Name change", line: "Change your name once more.", usd: null, arcl: null, use: true },
  // plaza: be seen in the hub
  { id: "feature-isle", cat: "plaza", name: "Island of the day", line: "Your island on the plaza screen for 24 hours, with a Visit button.", usd: 5, arcl: null, use: true, hours: 24 },
  { id: "billboard", cat: "plaza", name: "Plaza billboard", line: "An ArcPad coin on the plaza billboard for 6 hours.", usd: 3, arcl: null, use: true, hours: 6, target: "coin" },
  // not on the shelves: bought from the game itself
  { id: "revive", cat: "game", name: "Revive", line: "Get back up where you fell, with full HP and SP (and end a 24-hour rest).", tokens: 10000, usd: null, arcl: null, use: true },
  { id: "rekind", cat: "game", name: "Weapon kind change", line: "Turn one weapon into another kind (dual swords, hammer, blaster, bow or staff). It keeps its stats.", tokens: 5000, usd: null, arcl: null, use: true },
  { id: "isleup", cat: "game", name: "Village upgrade", line: "Your village's next level, from level 5 on (its XP has to be there first).", tokens: 1000, usd: null, arcl: null, use: true },
  { id: "rechar", cat: "game", name: "Character change", line: "Pick another character and a new name.", tokens: 10000, usd: null, arcl: null, use: true },
  // the season's Starter Package (STARTER below): a fixed $ARCIRCLE price that rises with each of your three buys
  { id: "starter", cat: "starter", name: "Starter Package", line: "1 random Legendary item, 2× EXP for 24 hours and 100 healing potions.", tokens: 30000, usd: null, arcl: null, use: true },
  // pet eggs (PET below): 3,000 $ARCIRCLE, paid on-chain; the server rolls the pet (rarity, then species)
  { id: "petegg", cat: "pet", name: "Pet egg", line: "Hatches a random companion: Common to Legendary. Every 10th egg is Rare or better; a pet you already have becomes pet XP.", tokens: 3000, usd: null, arcl: null, use: true },
  { id: "bagplus", cat: "game", name: "Bigger bag", line: "Eight more bag slots, for good. Buy it again for eight more, up to 120 slots.", tokens: 10000, usd: null, arcl: null, use: true },
  { id: "lot13", cat: "plaza", name: "Premium coin lot", line: "Your coin's Coin City lot grows to 13×13, with a rooftop spotlight. For the coin's creator.", usd: 10, arcl: null, target: "mycoin" },
];
const ITEM = Object.fromEntries(CATALOG.map((x) => [x.id, x]));
// ---- the Starter Package, sold by season (b414) ----
// Each season has its own count: at most `max` buys per wallet, at prices[0], prices[1], prices[2]. A buy gives a
// random-slot Legendary piece (the tier you can wear at your level, at least Cold Wallet; item level your level, at
// least 15), 2× EXP for 24 hours (added on top of time left) and 100 healing potions. The pieces and potions wait in
// worldOwn.starter.gifts until the game takes them (by gift id, once). A new season: a new id here (and open: true);
// open: false stops sales and keeps what was bought.
export const STARTER = { season: "S1", name: "Season 1", open: true, max: 3, prices: [30000, 40000, 50000], boostHours: 24, potions: 100, tierLv: [1, 5, 10, 15, 20] };
export const starterBought = (o) => (o && o.starter && o.starter.season === STARTER.season ? o.starter.n || 0 : 0);
// ---- pets (b422): eggs rolled here, kept in worldOwn.pets ----
// Odds by rarity (Common … Legendary, %), a Rare-or-better egg guaranteed at the 10th without one (a counter kept here),
// a pet you already own becomes pet XP (dupXp by rarity), at most `max` kept. Each species has a fixed rarity: the roll
// picks the rarity, then a species of it. SPECIES mirrors world-rpg-data.js PET_SPECIES (ids and rarities; the test
// checks they agree). worldOwn.pets = { list: [{ s, x }], n: eggs opened, pity: eggs since a Rare+, fresh: [{ gid, s, r, dup, xp }] }
// where x is the XP from duplicates (the game adds the knock-out XP it counts itself); `fresh` waits for the reveal card.
export const PET = {
  price: 3000, max: 30, pityAt: 10, odds: [60, 25, 10, 4, 1], dupXp: [40, 80, 160, 320, 640], xpCap: 5000,
  species: [["bunny", "chick", "pig", "cow", "hog", "beaver", "caterpillar", "crab"], ["deer", "dog", "kitten", "bee", "fish", "penguin", "koala"], ["fox", "monkey", "parrot", "panda", "drone", "cat"], ["tiger", "lion", "polar", "wisp"], ["elephant", "giraffe"]],
};
const PET_RARITY = Object.fromEntries(PET.species.flatMap((l, r) => l.map((id) => [id, r])));
export const petRarityOf = (id) => PET_RARITY[id];
const cryptoRnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
/// one egg: { r, s, pity } from the pity count so far (rnd: () => [0,1), crypto-random unless a test passes its own)
export function petRoll(pity, rnd = cryptoRnd) {
  let r = 0;
  const lo = (pity || 0) + 1 >= PET.pityAt ? 2 : 0, tot = PET.odds.slice(lo).reduce((a, b) => a + b, 0);
  let x = rnd() * tot; for (r = lo; r < PET.odds.length - 1 && x >= PET.odds[r]; r++) x -= PET.odds[r];
  const list = PET.species[r], s = list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
  return { r, s, pity: r >= 2 ? 0 : (pity || 0) + 1 };
}
/// where a free egg may come from over world-arcl-claim { kind: "petegg-free", source }: [pattern, check(w, source)].
/// Day 7 of the check-in is given by the check-in itself. The quest agent adds its quest here: e.g.
/// [/^quest:[a-z0-9-]+$/, async (w, src) => <the quest is really done>]
export const FREE_EGG_SOURCES = [];
export const petsOf = (o) => (o && o.pets && Array.isArray(o.pets.list) ? o.pets.list : []);
const STARTER_SLOTS = ["weapon", "shield", "armor", "helm", "ring", "boots", "necklace"];
// the Forge (world-rpg.js): gear for ARCL, tiers 0–3 (Legendary only drops from bosses), and supplies.
// Mirrors world-rpg-data.js (SLOTS, TIERS, FORGE_PRICE, FORGE_SUPPLY).
const FORGE_SLOTS = ["weapon", "shield", "armor", "helm", "ring", "boots", "necklace"], FORGE_TIER_LV = [1, 5, 10, 15, 20], FORGE_PRICE = [40, 120, 300, 700, 6000];
// the Masterwork bench (world-rpg-data.js MW): Arc-set Epic or Legendary pieces made at your level band (20–100),
// plain, +5 or +10. Mirrors mwBand and mwPrice there.
export const mwBand = (level) => Math.max(20, Math.min(100, Math.floor(Number(level) / 10) * 10));
export const mwPrice = (lv, r, p) => Math.round(((r === 4 ? 2000 + 280 * lv : 400 + 60 * lv) * (p === 10 ? 3.5 : p === 5 ? 1.8 : 1)) / 10) * 10;
// selling gear back to the Forge: by rarity, a little more per enhancement; the server can't see where a piece came
// from (drops happen in the browser), so sales are capped per day and each piece sells once
export const SELL_PRICE = [6, 18, 45, 110, 260], SELL_DAY_CAP = 1500;
export const sellPrice = (it) => Math.round(SELL_PRICE[Math.max(0, Math.min(4, Math.floor(Number(it && it.r) || 0)))] * (1 + 0.05 * Math.max(0, Math.min(10, Math.floor(Number(it && it.p) || 0)))));
const FORGE_SUPPLY = { hp5: { arcl: 30, kind: "hp", n: 5 }, sp5: { arcl: 30, kind: "sp", n: 5 }, recall3: { arcl: 20, kind: "recall", n: 3 },
  hp20: { arcl: 100, kind: "hp", n: 20 }, sp20: { arcl: 100, kind: "sp", n: 20 }, recall10: { arcl: 60, kind: "recall", n: 10 }, scrap100: { arcl: 150, kind: "scrap", n: 100 }, scrap500: { arcl: 650, kind: "scrap", n: 500 } };

const seoulDay = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
// the bag (world-rpg.js): 24 slots, and 8 more for each "Bigger bag" (10,000 $ARCIRCLE), up to 120
export const BAG_BASE = 24, BAG_STEP = 8, BAG_MAX = 120;
export const bagSize = (o) => Math.min(BAG_MAX, BAG_BASE + BAG_STEP * Math.max(0, Math.floor(Number(o && o.bag) || 0)));
// knocked out (world-combat.js): the first time each day (Seoul time) you get up for free; after that, a revive for
// 10,000 $ARCIRCLE or a 24-hour rest, when you can't fight and the hunting rewards are closed
export const KO_FREE = 1, KO_REST_MS = 24 * 3600e3;
export function isoWeek(t) {
  const d = new Date(t + 9 * 3600e3); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
  const y = d.getUTCFullYear(), first = new Date(Date.UTC(y, 0, 4)); return `${y}-W${String(1 + Math.round(((d - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7)).padStart(2, "0")}`;
}
const short = (w) => w.slice(0, 6) + "…" + w.slice(-4);

/// deps: { getDocs, setDoc, commit, json, now, signer(b) → { wallet } | { err }, launchRecord?, tokenBalance?, arcPrice?, receipt?, randomId? }
export function makeShop(deps) {
  // the day's limits (tests may set their own)
  const DAYCAP = () => (deps.dayCap ? deps.dayCap() : DAILY_CAP), SELLCAP = () => (deps.sellCap ? deps.sellCap() : SELL_DAY_CAP);
  const { getDocs, setDoc, commit, json, signer } = deps;
  const now = () => deps.now();
  const rid = deps.randomId || (() => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""));
  const one = async (p) => (await getDocs([p]))[p];

  async function own(w) { return (await one(`worldOwn/${w}`)) || { items: [], renames: 0, lots: [] }; }
  async function ledger(w) { return (await one(`worldArcl/${w}`)) || { bal: 0, earned: 0, spent: 0, streak: 0, lastDay: "", got: [], log: [] }; }
  async function note(w, t, k, n) {
    // the ledger's history (the balance itself moves with atomic increments)
    const L = await ledger(w);
    const log = [...(L.log || []), { t, k, n, at: now() }].slice(-40);
    const got = t === "earn" && !k.startsWith("daily") && k !== "stamp" && !(EARN_BY[k] && (EARN_BY[k].repeat || EARN_BY[k].weekly)) && !k.startsWith("support:") && !(L.got || []).includes(k) ? [...(L.got || []), k] : L.got || [];
    await setDoc(`worldArcl/${w}`, { ...L, log, got, bal: undefined, earned: undefined, spent: undefined });
    return { log, got };
  }
  // this week's ARCL board: the wallet's week total and the board in one read, then the board written back
  async function weekTop(w, wk, amt) {
    const key = `worldStats/arclWeek_${wk}`, d = await getDocs([`worldArclWeek/${wk}_${w}`, key]);
    const mine = (d[`worldArclWeek/${wk}_${w}`] || {}).n || amt, cur = d[key] || { top: [] };
    const top = [{ w: short(w), id: w, n: mine }, ...(cur.top || []).filter((x) => x.id !== w)].sort((a, b) => b.n - a.n).slice(0, 20);
    await setDoc(key, { top });
  }
  // the answer after a credit or a spend: the balance read alongside the ledger note (one round trip, not three)
  async function settle(w, noting, ...more) {
    const [n, B] = await Promise.all([noting.catch(() => null), balance(w), ...more.map((p) => p.catch(() => {}))]);
    if (n) { B.log = n.log.slice(-30).reverse(); B.got = n.got; }
    return B;
  }
  async function balance(w) {
    const d = await getDocs([`worldArclBal/${w}`, `worldArcl/${w}`]);
    const b = d[`worldArclBal/${w}`] || {}, L = d[`worldArcl/${w}`] || {};
    return { bal: b.bal || 0, earned: b.earned || 0, spent: b.spent || 0, streak: L.streak || 0, lastDay: L.lastDay || "", got: L.got || [], log: (L.log || []).slice(-30).reverse() };
  }
  // credit n ARCL for kind, inside today's cap; returns the amount credited
  async function credit(w, kind, n) {
    const day = seoulDay(now()), dk = `worldArclDay/${w}_${day}`;
    const today = ((await one(dk)) || {}).n || 0;
    const amt = Math.max(0, Math.min(n, DAYCAP() - today));
    if (amt <= 0) return 0;
    const wk = isoWeek(now());
    await commit([{ inc: dk, fields: { n: amt } }, { inc: `worldArclBal/${w}`, fields: { bal: amt, earned: amt } }, { inc: `worldArclWeek/${wk}_${w}`, fields: { n: amt } }]);
    await Promise.all([note(w, "earn", kind, amt).catch(() => {}), weekTop(w, wk, amt).catch(() => { /* the credit stands */ })]);
    return amt;
  }
  /// ARCL given by the GM (the village contest's prizes): outside the daily cap, noted in the ledger
  async function award(w, kind, n) {
    const amt = Math.max(0, Math.floor(Number(n) || 0)); if (!amt) return 0;
    await commit([{ inc: `worldArclBal/${w}`, fields: { bal: amt, earned: amt } }]);
    await note(w, "earn", kind, amt).catch(() => {});
    return amt;
  }
  // an older sale record without its amount: unpaid when the ledger reaches back past it and shows no sale credit
  // within a few seconds after it
  async function unpaid(w, at) {
    const log = (await ledger(w)).log || [];
    if (!log.length || !(log[0].at < at)) return false;
    return !log.some((x) => x.t === "earn" && x.k === "sell" && x.at >= at && x.at - at < 8000);
  }
  async function sell(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, it = b.item || {}, id = String(it.id || "");
    if (!/^[a-z0-9]{4,10}$/.test(id) || !/^(weapon|shield|armor|helm|ring|boots|necklace)-[0-4]$/.test(String(it.b || ""))) return json(400, { error: "that isn't a piece of gear" });
    const price = sellPrice(it), day = seoulDay(now()), dk = `worldSellDay/${w}_${day}`, sk = `worldSold/${w}_${id}`;
    const ek = `worldArclDay/${w}_${day}`, d0 = await getDocs([dk, ek]), sold = (d0[dk] || {}).n || 0, earned = (d0[ek] || {}).n || 0;
    // a sale is paid inside both of today's limits: 1,500 ARCL of sales and the 30,000 ARCL a day everything shares.
    // With no room left the piece stays in the bag, unsold, so it can still be sold tomorrow.
    const amt = Math.max(0, Math.min(price, SELLCAP() - sold, DAYCAP() - earned));
    if (amt <= 0) return json(200, { ok: true, credited: 0, capped: true, full: sold >= SELLCAP() ? "sell" : "earn", price, left: Math.max(0, SELLCAP() - sold), ...(await balance(w)) });
    // the sale record, the day's sales, the day's earnings, the balance and the week in one atomic write (fast: the
    // Forge answers in a few round trips, not a dozen)
    const wk = isoWeek(now()), pay = [{ inc: dk, fields: { n: amt } }, { inc: ek, fields: { n: amt } }, { inc: `worldArclBal/${w}`, fields: { bal: amt, earned: amt } }, { inc: `worldArclWeek/${wk}_${w}`, fields: { n: amt } }];
    if (!(await commit([{ create: sk, data: { at: now(), b: it.b, got: amt } }, ...pay])).ok) {
      // sold before: refused, unless that sale paid nothing (an older version recorded sales the day's limit had
      // already swallowed); then it sells properly now
      const prev = (await one(sk)) || {};
      if (prev.got !== 0 && !(prev.got == null && prev.at > now() - 3 * 864e5 && await unpaid(w, prev.at))) return json(409, { error: "that piece was already sold" });
      await setDoc(sk, { at: now(), b: it.b, got: amt, again: true });
      await commit(pay);
    }
    const B = await settle(w, note(w, "earn", "sell", amt), weekTop(w, wk, amt));
    return json(200, { ok: true, credited: amt, price, capped: amt < price, left: Math.max(0, SELLCAP() - sold - amt), ...B });
  }
  // this week's hunters: points only for knock-outs the server counted (the daily caps above bound them)
  async function huntPoint(w, pts) {
    const wk = isoWeek(now()), mk = `worldHuntWeek/${wk}_${w}`;
    await commit([{ inc: mk, fields: { n: pts } }]);
    const mine = ((await one(mk)) || {}).n || pts, key = `worldStats/huntWeek_${wk}`, cur = (await one(key)) || { top: [] };
    const name = (((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16);
    const top = [{ w: short(w), id: w, n: mine, name }, ...(cur.top || []).filter((x) => x.id !== w)].sort((a, b) => b.n - a.n).slice(0, 20);
    await setDoc(key, { top });
  }
  // the drop feed: Epic and Legendary finds, shown to everyone in the game (the server can't see the drop itself, so
  // it's rate-limited and only ever a line of text — it carries nothing)
  async function feedDrop(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, r = Math.floor(Number(b.r)), m = /^([a-z]+)-([0-4])$/.exec(String(b.b || ""));
    if (!m || !FORGE_SLOTS.includes(m[1]) || !(r === 3 || r === 4)) return json(400, { error: "only Epic and Legendary finds go in the feed" });
    const day = seoulDay(now()), dk = `worldFeedDay/${w}_${day}`;
    if (!(await commit([{ create: `worldFeedGap/${w}_${Math.floor(now() / 60e3)}`, data: { at: now() } }])).ok) return json(429, { error: "one a minute" });
    if ((((await one(dk)) || {}).n || 0) >= 10) return json(200, { ok: true, capped: true });
    await commit([{ inc: dk, fields: { n: 1 } }]);
    const name = (((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16);
    const cur = (await one("worldStats/drops")) || { list: [] };
    await setDoc("worldStats/drops", { list: [{ w: short(w), name, b: m[0], r, at: now() }, ...(cur.list || [])].slice(0, 20) });
    return json(200, { ok: true });
  }
  // a reward the team approved (the support desk): outside the daily cap, logged like any other ARCL
  async function rewardArcl(w, kind, n) {
    const amt = Math.max(0, Math.floor(Number(n) || 0)); if (!amt) return 0;
    const wk = isoWeek(now());
    await commit([{ inc: `worldArclBal/${w}`, fields: { bal: amt, earned: amt } }, { inc: `worldArclWeek/${wk}_${w}`, fields: { n: amt } }]);
    await note(w, "earn", kind, amt).catch(() => {});
    return amt;
  }
  const onceOk = async (w, kind) => (await commit([{ create: `worldArclOnce/${w}_${kind}`, data: { at: now() } }])).ok;

  // ---- knocked out: one free get-up a day, then a revive ($ARCIRCLE) or a 24-hour rest ----
  async function koOf(w) { const k = (await one(`worldKo/${w}`)) || {}, day = seoulDay(now()); return { day, used: k.day === day ? k.used || 0 : 0, until: Number(k.until) || 0, n: k.n || 0, paid: k.paid || 0, at: k.at || 0, down: Number(k.down) || 0 }; }
  // pending: knocked out with no free get-up left and no choice made yet (a reload brings the choice back)
  const koView = (k) => ({ freeLeft: Math.max(0, KO_FREE - k.used), until: k.until > now() ? k.until : 0, pending: !!k.down && !(k.until > now()), cost: ITEM.revive.tokens });
  async function knockout(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, k = await koOf(w), t = now();
    if (k.until > t) return json(200, { ok: true, free: false, ...koView(k) }); // already resting
    if (t - k.at < 5000) return json(429, { error: "too fast" });
    if (k.used < KO_FREE) { await setDoc(`worldKo/${w}`, { day: k.day, used: k.used + 1, until: 0, n: k.n + 1, paid: k.paid, at: t, down: 0 }); return json(200, { ok: true, free: true, ...koView({ ...k, used: k.used + 1 }) }); }
    await setDoc(`worldKo/${w}`, { day: k.day, used: k.used, until: 0, n: k.n + 1, paid: k.paid, at: t, down: t });
    return json(200, { ok: true, free: false, ...koView({ ...k, down: t }) });
  }
  /// the second choice after a knockout with no free get-up left: rest for 24 hours (from now)
  async function koRest(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, k = await koOf(w), t = now();
    if (k.until > t) return json(200, { ok: true, ...koView(k) });
    if (!k.down) return json(400, { error: k.used < KO_FREE ? "you still have today's free get-up" : "no knockout to rest from" });
    const until = t + KO_REST_MS; await setDoc(`worldKo/${w}`, { day: k.day, used: k.used, until, n: k.n, paid: k.paid, at: t, down: 0 });
    return json(200, { ok: true, ...koView({ ...k, until }) });
  }
  async function claim(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, kind = String(b.kind || ""), e = EARN_BY[kind];
    if (kind === "petegg-free") {
      // only sources the server can vouch for: the quest agent adds its quest to FREE_EGG_SOURCES
      const src = String(b.source || ""), chk = FREE_EGG_SOURCES.find(([re]) => re.test(src));
      if (!chk || !(await chk[1](w, src))) return json(400, { error: "that isn't a source of a free egg" });
      const r = await freeEgg(w, src);
      return r.ok ? json(200, { ok: true, kind, credited: 0, card: r.card, own: r.own }) : r.already ? json(409, { error: "already taken" }) : json(400, { error: r.error });
    }
    if (!e) return json(400, { error: "unknown kind" });
    if (kind === "stamp") return json(400, { error: "stamps are credited when you leave one" });
    if (kind === "sell") return json(400, { error: "sell gear at the Forge" });
    if (kind === "raid") return json(400, { error: "the raid's reward is claimed at the raid" });
    let n = e.n;
    if (e.repeat && /^(street|hunt|boss|pickup)$/.test(kind)) { const k = await koOf(w); if (k.until > now() || k.down) return json(423, { error: "resting after a knockout", until: k.until }); }
    if (e.repeat) {
      // hunting grounds: the stronger the scammer, the more ARCL, but only for a character whose saved level could
      // be there (the server can't watch the fight; the level comes from the saved progress)
      if (kind === "hunt" || kind === "boss") {
        const tier = kind === "hunt" ? Math.max(2, Math.min(4, Math.floor(Number(b.tier) || 2))) : Math.max(0, Math.min(4, Math.floor(Number(b.zone) || 0)));
        const need = kind === "hunt" ? [0, 0, 5, 10, 15][tier] : [1, 5, 10, 15, 20][tier];
        const save = await one(`worldSave/${w}`), level = levelOfSave(save);
        if (level < need) return json(400, { error: `needs level ${need} (your saved level is ${level})` });
        n = kind === "hunt" ? [0, 5, 8, 10, 12][tier] : 30;
      }
      const day = seoulDay(now()), slot = Math.floor(now() / (e.repeat.gap * 1000));
      if (!(await commit([{ create: `worldArclGap/${w}_${kind}_${slot}`, data: { at: now() } }])).ok) return json(429, { error: "too fast — a moment between these" });
      const ck = `worldArclRep/${w}_${kind}_${day}`, c = ((await one(ck)) || {}).n || 0;
      if (c >= e.repeat.max) return json(200, { ok: true, kind, credited: 0, capped: true, ...(await balance(w)) });
      await commit([{ inc: ck, fields: { n: 1 } }]);
      const got = await credit(w, kind, n);
      if (kind === "street" || kind === "hunt" || kind === "boss") await huntPoint(w, kind === "street" ? 1 : kind === "boss" ? 10 : [0, 0, 2, 3, 4][Math.max(2, Math.min(4, Math.floor(Number(b.tier) || 2)))]).catch(() => {});
      return json(200, { ok: true, kind, credited: got, capped: got < n, left: e.repeat.max - c - 1, ...(await balance(w)) });
    }
    if (kind === "daily") {
      const day = seoulDay(now()), y = seoulDay(now() - 864e5);
      if (!(await commit([{ create: `worldArclDaily/${w}_${day}`, data: { at: now() } }])).ok) return json(409, { error: "already checked in today" });
      const L = await ledger(w), streak = L.lastDay === y ? (L.streak || 0) + 1 : 1;
      await setDoc(`worldArcl/${w}`, { ...L, streak, lastDay: day, bal: undefined, earned: undefined, spent: undefined });
      n = 20 + Math.min(30, 5 * (streak - 1));
      const got = await credit(w, kind, n);
      const egg = streak % 7 === 0 ? await freeEgg(w, "daily:" + day).catch(() => null) : null; // day 7 of the calendar: a pet egg
      return json(200, { ok: true, kind, credited: got, streak, ...(egg && egg.ok ? { petegg: true, own: egg.own } : {}), ...(await balance(w)) });
    }
    if (kind.startsWith("stage:")) {
      const id = kind.slice(6);
      if (Number(b.answer) !== STAGE_WIN[id]) return json(400, { error: "that isn't how this scammer is beaten" });
    } else if (kind === "hold") {
      const bal = deps.tokenBalance ? await deps.tokenBalance(ARCIRCLE, w).catch(() => 0n) : 0n;
      if (!(BigInt(bal || 0) > 0n)) return json(400, { error: "no $ARCIRCLE in this wallet yet" });
    } else if (kind === "launch") {
      const coin = lc(b.coin); if (!isAddr(coin)) return json(400, { error: "which coin?" });
      const rec = deps.launchRecord ? await deps.launchRecord(coin) : null;
      if (!rec || lc(rec.creator) !== w) return json(400, { error: "this wallet didn't launch that coin" });
    } else if (/^(isle|res)\d+$/.test(kind)) {
      const isl = await one(`worldIsland/${w}`); const need = Number(kind.replace(/\D/g, ""));
      const have = kind.startsWith("isle") ? (isl && isl.n) || 0 : (isl && isl.res) || 0;
      if (have < need) return json(400, { error: "your saved island isn't there yet" });
    } else if (kind === "vill2") {
      const isl = await one(`worldIsland/${w}`); // the village grows with the saved island (api/_world-village.mjs)
      if (xpLevel((isl && isl.vxp) || 0) < 2) return json(400, { error: "your village centre isn't level 2 yet" });
    } else if (kind === "vquest9") {
      const isl = await one(`worldIsland/${w}`); // the chain's steps are played in the browser; the server asks for a saved island at least
      if (!(isl && isl.n > 0)) return json(400, { error: "build on your island first" });
      if (!(await onceOk(w, kind))) return json(409, { error: "already collected" });
      const egg = await grantFreeEgg(w, "vquest9");
      return json(200, { ok: true, kind, credited: 0, egg: egg && egg.ok ? 1 : 0, ...(await balance(w)) });
    } else if (kind.startsWith("liked")) {
      const likes = ((await one(`worldIslandLikes/${w}`)) || {}).n || 0;
      if (likes < Number(kind.slice(5))) return json(400, { error: "not enough likes yet" });
    }
    if (!(await onceOk(w, kind))) return json(409, { error: "already collected" });
    const got = await credit(w, kind, n);
    return json(200, { ok: true, kind, credited: got, capped: got < n, ...(await balance(w)) });
  }
  // the island chain's last step (share your island): one free egg, marked once per wallet by freeEgg()
  async function grantFreeEgg(w, src) { const r = await freeEgg(w, "quest:" + src); return r && !r.error && !r.already ? { ok: true, ...r } : { ok: false, ...r }; }
  // a stamp left on someone else's island (api/_world.mjs calls this after the stamp is saved)
  async function stampCredit(w) {
    const day = seoulDay(now());
    if (!(await commit([{ inc: `worldArclStampDay/${w}_${day}`, fields: { n: 1 } }])).ok) return 0;
    const c = ((await one(`worldArclStampDay/${w}_${day}`)) || {}).n || 0;
    return c <= 3 ? credit(w, "stamp", EARN_BY.stamp.n) : 0;
  }

  // ---- what an item does once it's paid for ----
  async function checkBuy(w, it, target) {
    if (!it) return "unknown item";
    const o = await own(w);
    if (!it.use && o.items.includes(it.id)) return "you already have this";
    if (it.needs && !o.items.includes(it.needs)) return "get the 48×48 expansion first";
    if (it.id === "bagplus" && bagSize(o) >= BAG_MAX) return `your bag is as big as it gets (${BAG_MAX} slots)`;
    if (it.id === "isleup") { const u = deps.isleNext ? await deps.isleNext(w) : { why: "not available" }; if (u.why) return u.why; }
    if (it.id === "starter") { if (!STARTER.open) return "the Starter Package isn't on sale this season"; if (starterBought(o) >= STARTER.max) return `you've bought the Starter Package ${STARTER.max} times this season`; }
    if (it.id === "petegg" && petsOf(o).length >= PET.max) return `you already have ${PET.max} pets`;
    if (it.id === "rename" && !(deps.hasName ? await deps.hasName(w) : true)) return "your first name is free: set it in the character maker";
    if (it.target === "coin" || it.target === "mycoin") {
      const coin = lc(target); if (!isAddr(coin)) return "pick a coin";
      const rec = deps.launchRecord ? await deps.launchRecord(coin) : null;
      if (!rec) return "not an ArcPad coin";
      if (it.target === "mycoin" && lc(rec.creator) !== w) return "only the coin's creator can buy this";
      if (it.id === "lot13" && (o.lots || []).includes(coin)) return "this lot is already premium";
    }
    return null;
  }
  // one egg into o.pets (in place): the roll, the pity count, a duplicate's XP, the card the game shows once
  function hatch(o, at, rnd) {
    const P = o.pets = o.pets && Array.isArray(o.pets.list) ? o.pets : { list: [], n: 0, pity: 0, fresh: [] };
    const k = petRoll(P.pity, rnd), have = P.list.find((x) => x.s === k.s);
    let xp = 0;
    if (have) { xp = PET.dupXp[k.r]; have.x = Math.min(PET.xpCap, (have.x || 0) + xp); }
    else if (P.list.length < PET.max) P.list.push({ s: k.s, x: 0 });
    P.pity = k.pity; P.n = (P.n || 0) + 1;
    P.fresh = [...(P.fresh || []), { gid: rid().slice(0, 10), s: k.s, r: k.r, dup: !!have, xp, at }].slice(-5);
    return P.fresh[P.fresh.length - 1];
  }
  /// a free egg, once per source id ("daily:<day>", "quest:<id>"…): the marker is created first, so asking twice gives one.
  /// The quest agent calls this (or world-arcl-claim kind "petegg-free" once its source is allowed in FREE_EGG_SOURCES).
  async function freeEgg(w, source, rnd) {
    const id = String(source || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 40);
    if (!id) return { error: "no source" };
    if (petsOf(await own(w)).length >= PET.max) return { error: `you already have ${PET.max} pets` };
    if (!(await commit([{ create: `worldPetFree/${w}_${id}`, data: { at: now() } }])).ok) return { already: true };
    const o = await own(w), card = hatch(o, now(), rnd);
    o.buys = [...(o.buys || []), { id: "petegg", via: "free:" + id, at: now() }].slice(-40);
    await setDoc(`worldOwn/${w}`, o);
    return { ok: true, card, own: o };
  }
  async function grant(w, it, target, via) {
    const o = await own(w), at = now();
    if (it.id === "rename") o.renames = (o.renames || 0) + 1;
    else if (it.id === "revive") { o.revives = (o.revives || 0) + 1; const k = await one(`worldKo/${w}`); if (k && (k.until > at || k.down)) await setDoc(`worldKo/${w}`, { ...k, until: 0, down: 0, paid: (k.paid || 0) + 1 }); }
    else if (it.id === "rekind") o.rekinds = (o.rekinds || 0) + 1; // used up by the save that changes a weapon's kind (api/_world.mjs)
    else if (it.id === "isleup") o.isleLv = Math.max(o.isleLv || 0, Math.floor(Number(String(target || "").replace(/^lv:/, "")) || 0)); // the level this payment was quoted for
    else if (it.id === "starter") {
      const st0 = o.starter && o.starter.season === STARTER.season ? o.starter : { season: STARTER.season, n: 0, gifts: [] };
      const sv = (await getDocs([`worldSave/${w}`]))[`worldSave/${w}`], lv = Math.max(1, sv ? levelOfSave(sv) : 1);
      const tier = Math.max(1, STARTER.tierLv.filter((x) => x <= lv).length - 1), slot = STARTER_SLOTS[Math.floor(Math.random() * STARTER_SLOTS.length)];
      const item = { id: rid().slice(0, 8), b: `${slot}-${tier}`, r: 4, lv: Math.max(15, Math.min(100, lv)), p: 0, ...(slot === "weapon" ? { k: Math.floor(Math.random() * 5) } : {}) };
      const gift = { gid: rid().slice(0, 10), item, hp: STARTER.potions, at };
      o.starter = { season: STARTER.season, n: (st0.n || 0) + 1, gifts: [...(st0.gifts || []), gift].slice(-STARTER.max) };
      o.xpBoostUntil = Math.max(at, Number(o.xpBoostUntil) || 0) + STARTER.boostHours * 3600e3;
    }
    else if (it.id === "petegg") hatch(o, at);
    else if (it.id === "rechar") o.rechars = (o.rechars || 0) + 1; // used up by the save that changes the character or name
    else if (it.id === "bagplus") o.bag = Math.min((BAG_MAX - BAG_BASE) / BAG_STEP, Math.max(0, Math.floor(Number(o.bag) || 0)) + 1);
    else if (it.id === "lot13") o.lots = [...new Set([...(o.lots || []), lc(target)])];
    else if (it.id === "feature-isle" || it.id === "billboard") {
      const P = (await one("worldStats/plaza")) || { isle: [], coin: [] }, k = it.id === "billboard" ? "coin" : "isle";
      const list = (P[k] || []).filter((x) => x.until > at);
      const start = Math.max(at, ...list.map((x) => x.until));
      let entry;
      if (k === "isle") { const isl = await one(`worldIsland/${w}`); entry = { wallet: w, name: (isl && isl.name) || short(w) }; }
      else { const rec = deps.launchRecord ? await deps.launchRecord(lc(target)) : null; entry = { token: lc(target), symbol: (rec && (rec.symbol || rec.sym)) || "", by: w }; }
      list.push({ ...entry, start, until: start + it.hours * 3600e3 });
      await setDoc("worldStats/plaza", { ...P, [k]: list.slice(-30) });
    } else o.items = [...new Set([...(o.items || []), it.id])];
    o.buys = [...(o.buys || []), { id: it.id, via, at }].slice(-40);
    await setDoc(`worldOwn/${w}`, o);
    return o;
  }
  async function spend(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, it = ITEM[b.item];
    if (!it || it.arcl == null) return json(400, { error: "this item isn't sold for ARCL" });
    const [why, B0] = await Promise.all([checkBuy(w, it, b.target), getDocs([`worldArclBal/${w}`])]); if (why) return json(400, { error: why });
    if (((B0[`worldArclBal/${w}`] || {}).bal || 0) < it.arcl) return json(400, { error: "not enough ARCL" });
    // one ARCL purchase at a time per wallet (so two at once can't both spend the same balance), paid in the same write
    if (!(await commit([{ create: `worldArclSpend/${w}_${Math.floor(now() / 3000)}`, data: { at: now() } }, { inc: `worldArclBal/${w}`, fields: { bal: -it.arcl, spent: it.arcl } }])).ok) return json(429, { error: "one moment" });
    const o = await grant(w, it, b.target, "arcl");
    const B = await settle(w, note(w, "spend", it.id, -it.arcl));
    return json(200, { ok: true, item: it.id, own: o, ...B });
  }

  // ---- the Forge: ARCL for gear and supplies ----
  async function forgeBuy(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, id = String(b.item || "");
    const sup = FORGE_SUPPLY[id], m = /^([a-z]+):([0-4])$/.exec(id), mw = /^mw:([a-z]+):([34]):(0|5|10)$/.exec(id);
    if (!sup && !(m && FORGE_SLOTS.includes(m[1])) && !(mw && FORGE_SLOTS.includes(mw[1]))) return json(400, { error: "the Forge doesn't sell that" });
    const tier = m ? +m[2] : 0;
    let price = sup ? sup.arcl : m ? FORGE_PRICE[tier] : 0, band = 0;
    const d0 = await getDocs([`worldSave/${w}`, `worldArclBal/${w}`]), bal = (d0[`worldArclBal/${w}`] || {}).bal || 0;
    if (m || mw) {
      const level = levelOfSave(d0[`worldSave/${w}`]);
      if (m && level < FORGE_TIER_LV[tier]) return json(400, { error: `needs level ${FORGE_TIER_LV[tier]} (your saved level is ${level})` });
      if (mw) { if (level < 20) return json(400, { error: `needs level 20 (your saved level is ${level})` }); band = mwBand(level); price = mwPrice(band, +mw[2], +mw[3]); }
    }
    if (bal < price) return json(400, { error: "not enough ARCL" });
    // the pace gate, the payment and the Forge's count in one atomic write; then the note and the new balance together
    if (!(await commit([{ create: `worldArclSpend/${w}_${Math.floor(now() / 1500)}`, data: { at: now() } }, { inc: `worldArclBal/${w}`, fields: { bal: -price, spent: price } }, { inc: "worldStats/forge", fields: { sold: 1, arcl: price } }])).ok) return json(429, { error: "one moment" });
    const B = await settle(w, note(w, "spend", sup ? "forge:" + id : mw ? "forge:mw-" + mw[1] : "forge:" + m[1], -price));
    if (sup) return json(200, { ok: true, supply: { kind: sup.kind, n: sup.n }, ...B });
    const k = Number.isInteger(b.k) && b.k >= 0 && b.k <= 4 ? b.k : undefined; // a weapon's kind (sword … staff), the one you wield
    const item = mw ? { id: rid().slice(0, 6), b: `${mw[1]}-4`, r: +mw[2], lv: band, p: +mw[3], ...(mw[1] === "weapon" && k != null ? { k } : {}) }
      : { id: rid().slice(0, 6), b: `${m[1]}-${tier}`, r: tier, lv: FORGE_TIER_LV[tier], p: 0, ...(m[1] === "weapon" && tier === 4 && k != null ? { k } : {}) };
    return json(200, { ok: true, item, ...B });
  }

  // ---- $ARCIRCLE: quote, then the player's own transfer to FeeBurn, then the receipt ----
  async function quote(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, it = ITEM[b.item];
    if (!it) return json(400, { error: "unknown item" });
    const why = await checkBuy(w, it, b.target); if (why) return json(400, { error: why });
    let price = 0, wei, target = lc(b.target || "");
    if (it.id === "isleup") { const u = await deps.isleNext(w); wei = BigInt(u.tokens) * 10n ** 18n; target = "lv:" + u.next; } // the price of the next village level
    else if (it.id === "starter") { const n = starterBought(await own(w)); wei = BigInt(STARTER.prices[n]) * 10n ** 18n; target = `${STARTER.season}:${n + 1}`; } // this season's next price
    else if (it.tokens) wei = BigInt(it.tokens) * 10n ** 18n; // a fixed $ARCIRCLE amount (revive)
    else {
      price = deps.arcPrice ? Number(await deps.arcPrice().catch(() => 0)) : 0;
      if (!(price > 0)) return json(503, { error: "can't price $ARCIRCLE right now; try again in a minute" });
      wei = BigInt(Math.ceil((it.usd / price) * 1e6)) * 10n ** 12n;
    }
    const id = rid(), exp = now() + QUOTE_MS;
    await setDoc(`worldPayQuote/${id}`, { wallet: w, item: it.id, target, usd: it.usd, amount: wei.toString(), price, exp });
    return json(200, { ok: true, quote: id, item: it.id, usd: it.usd, amount: wei.toString(), tokens: Number(wei / 10n ** 12n) / 1e6, to: FEE_BURN, token: ARCIRCLE, exp });
  }
  async function confirm(b) {
    const s = signer(b); if (s.err) return s.err;
    const w = s.wallet, tx = lc(b.tx);
    if (!/^0x[0-9a-f]{64}$/.test(tx)) return json(400, { error: "that isn't a transaction hash" });
    const q = await one(`worldPayQuote/${String(b.quote || "").replace(/[^0-9a-f]/g, "")}`);
    if (!q || q.wallet !== w) return json(400, { error: "unknown quote" });
    if (q.used) return json(409, { error: "this quote was already used" });
    if (now() > q.exp + 30 * 60e3) return json(400, { error: "the quote expired; get a new price" });
    const rc = deps.receipt ? await deps.receipt(tx).catch(() => null) : null;
    if (!rc) return json(202, { pending: true, error: "the transaction isn't confirmed yet" });
    if (rc.status !== "0x1") return json(400, { error: "the transaction failed" });
    const paid = (rc.logs || []).filter((l) => lc(l.address) === ARCIRCLE && l.topics && lc(l.topics[0]) === TRANSFER && lc(l.topics[1]) === pad32(w) && lc(l.topics[2]) === pad32(FEE_BURN)).reduce((a, l) => a + BigInt(l.data), 0n);
    if (paid < BigInt(q.amount)) return json(400, { error: "the transfer is less than the quote" });
    if (!(await commit([{ create: `worldPayTx/${tx}`, data: { wallet: w, item: q.item, at: now() } }])).ok) return json(409, { error: "this transaction was already used" });
    await setDoc(`worldPayQuote/${b.quote}`, { ...q, used: tx });
    const it = ITEM[q.item];
    const o = await grant(w, it, q.target, "arcircle");
    await commit([{ inc: "worldStats/shop", fields: { paid: 1 } }]).catch(() => {});
    return json(200, { ok: true, item: it.id, own: o, burned: (paid / 2n).toString(), treasury: (paid - paid / 2n).toString() });
  }
  async function plaza() {
    const P = (await one("worldStats/plaza")) || {}, t = now();
    const cur = (k) => (P[k] || []).find((x) => x.start <= t && x.until > t) || null;
    // no island bought for the screen: last week's most-liked island (the weekly contest) gets it
    let isle = cur("isle");
    if (!isle) { const w = (((await one(`worldStats/islandWeek_${isoWeek(t - 7 * 864e5)}`)) || {}).top || [])[0]; if (w && w.wallet) isle = { wallet: w.wallet, name: w.name || "", contest: true, likes: w.likes || 0 }; }
    return { isle, coin: cur("coin") };
  }

  return {
    stampCredit, own, plaza, freeEgg, koOf, rewardArcl, credit, award, isoWeek,
    owns: async (w, id) => ((await own(w)).items || []).includes(id),
    lotPremium: async (w, coin) => ((await own(w)).lots || []).includes(lc(coin)),
    renames: async (w) => (await own(w)).renames || 0,
    async read(view, url) {
      const w = lc(url.searchParams.get("wallet"));
      if (view === "starter") { const o = isAddr(w) ? await own(w) : null, n = starterBought(o); return json(200, { ...STARTER, bought: n, next: n < STARTER.max ? STARTER.prices[n] : null, boostUntil: (o && o.xpBoostUntil) || 0, now: now() }, "no-store"); }
      if (view === "shop") return json(200, { items: CATALOG, own: isAddr(w) ? await own(w) : null, plaza: await plaza(), feeBurn: FEE_BURN, token: ARCIRCLE, burnPct: 50, exchange: EXCHANGE }, isAddr(w) ? "no-store" : "public, max-age=30");
      if (view === "arcl") return isAddr(w) ? json(200, { ...(await balance(w)), cap: DAYCAP(), today: ((await one(`worldArclDay/${w}_${seoulDay(now())}`)) || {}).n || 0, sold: ((await one(`worldSellDay/${w}_${seoulDay(now())}`)) || {}).n || 0, sellCap: SELLCAP(), earn: EARN, exchange: EXCHANGE, notify: !!(await one(`worldArclNotify/${w}`)) }) : json(400, { error: "wallet must be an address" });
      if (view === "arcl-top") return json(200, { week: isoWeek(now()), top: (((await one(`worldStats/arclWeek_${isoWeek(now())}`)) || {}).top || []).map(({ w: s, n }) => ({ w: s, n })) }, "public, max-age=30");
      if (view === "plaza") return json(200, await plaza(), "public, max-age=30");
      if (view === "ko") return isAddr(w) ? json(200, koView(await koOf(w)), "no-store") : json(400, { error: "wallet" });
      if (view === "hunt-top") return json(200, { week: isoWeek(now()), top: (((await one(`worldStats/huntWeek_${isoWeek(now())}`)) || {}).top || []).map(({ w: s, n, name }) => ({ w: s, n, name: name || "" })) }, "public, max-age=30");
      if (view === "drops") return json(200, { drops: (((await one("worldStats/drops")) || {}).list || []).filter((x) => now() - x.at < 864e5) }, "public, max-age=20");
      return null;
    },
    async handle(b) {
      if (b.action === "world-arcl-claim") return claim(b);
      if (b.action === "world-arcl-spend") return spend(b);
      if (b.action === "world-forge-buy") return forgeBuy(b);
      if (b.action === "world-feed-drop") return feedDrop(b);
      if (b.action === "world-sell") return sell(b);
      if (b.action === "world-pay-quote") return quote(b);
      if (b.action === "world-pay-confirm") return confirm(b);
      if (b.action === "world-ko") return knockout(b);
      if (b.action === "world-ko-rest") return koRest(b);
      if (b.action === "world-arcl-notify") { const s = signer(b); if (s.err) return s.err; await setDoc(`worldArclNotify/${s.wallet}`, { on: !!b.on, at: now() }); return json(200, { ok: true, notify: !!b.on }); }
      return null;
    },
  };
}
