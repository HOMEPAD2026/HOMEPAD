// api/_world-jur.mjs — Jurassic World's survival (world-jurassic.js): gathering, crafting and building on your own plot.
// Open to every signed-in wallet (it was GM-only before launch). What you gather is decided here: how many swings a tree or rock
// takes (by your tool), when it can break (no faster than real swings), what it drops, when it grows back; a day's
// gathering has a cap (bots). Ore from Jurassic rocks goes into the ARCL Mine's pockets (worldMineInv: one ore bag for
// both worlds), and the mine's pickaxe (tier and +level) is the one you mine with here. The only ARCL paid here is the
// three daily missions' (b-jx1: gather 60 materials · make or build 3 things · cook 2 meals, 300 each, once a day): they
// count taking part, never a win, and each needs the swings and materials it says.
//
//   GET  ?world=jur&wallet=0x…                                   → { ok, inv, ore, pick, felled, recipes, plot }
//   POST { action: "world-jur-start", …signature, node, kind }   → { need, at }          (the first swing at a node)
//   POST { action: "world-jur-break", …signature, node }         → { loot, ore?, inv, regrowAt }
//   POST { action: "world-jur-craft", …signature, recipe }       → { inv, ore }
//   POST { action: "world-jur-camp",  …signature, op: claim|join, slot? } → { home, camps }
//   POST { action: "world-jur-build", …signature, op, piece }    → { plot, inv }          (place / remove at your camp)
//   POST { action: "world-jur-eat",   …signature, food }         → { inv, fed }
//   (break, craft and build also answer paid: [{ key, n }] when a daily mission is done and paid)
//   GET  ?world=jur-boss[&wallet=0x…]                            → { on, id, kind, start, end, max, hp, hunters, down, next, mine? }
//   POST { action: "world-jur-boss-hit", …signature, n }         → { hp, max, hunters, down, mine }   (b-jx2: the boss hour)
//   POST { action: "world-jur-boss-claim", …signature, id }      → { loot, inv }                       (a hunter's share, once)
//   GET  ?world=jur-top                                          → { week, top: [{ w, name, n }], crews: [{ tag, n }] } (the week's hunters and crews)
//   POST { action: "world-jur-here", …signature, x, z, f, hp, c, lv, pk? } → { list }   (b-jy3: who's hunting here, their pings)
//   POST { action: "world-jur-raid-claim", …signature, key }     → { arcl }             (b-jy4: a night raid held, once a night)
//   POST { action: "world-jur-tame", …signature, kind }          → { tamed, inv }       (b-jy7: a bola and berries; a chance)
//   POST { action: "world-jur-like", …signature, slot }          → { likes }            (b-jy7: a camp you visit, once a week)
//   POST { action: "world-jur-note", …signature, slot, t }       → { notes }            (b-jy7: a line from the fixed list, once a day)
//   GET  ?world=jur-camp&slot=N                                  → { owner, members, likes, notes }
//   (b-jy7: the Mire's reeds, mud and Bog Stalker; fossil dig sites; meteors only while a meteor shower is on — weatherAt)
//   (the boss hour's view also has top: the hunters with the most hits, and by: who landed the last one; a hunter's share
//   pays a little ARCL now too, b-jy4: for taking part — 10 hits — not for the kill)
//
// Firestore: worldJurInv/<wallet> { mat, tools, felled, work, day, got, home, mis, hunted } · worldJurPay/<w>_<day>_<key> (a mission paid) · worldJurPlot/<owner> { pieces } · worldJurCamp/<slot> { w, members }
export const JUR = {
  HIT_MS: 430, SLACK: 0.7, DAY_CAP: 6000, FELLED_MAX: 500, PLOT_MAX: 160, PLOT_R: 9,
  // per kind: swings (low–high, then × the tool's factor), what drops (low–high), how long until it's back
  NODES: {
    tree: { tool: "axe", hits: [8, 12], loot: { wood: [4, 7], fiber: [0, 1] }, regrow: 6 * 3600e3 },
    palm: { tool: "axe", hits: [6, 9], loot: { wood: [3, 5], fiber: [1, 3] }, regrow: 6 * 3600e3 },
    ancient: { tool: "axe", hits: [26, 34], loot: { wood: [12, 18], hardwood: [3, 5], amber: [0, 1] }, regrow: 24 * 3600e3 },
    fern: { tool: "", hits: [1, 1], loot: { fiber: [1, 3], wood: [0, 1] }, regrow: 20 * 60e3 },
    bush: { tool: "", hits: [1, 1], loot: { fiber: [1, 2], berries: [1, 3] }, regrow: 30 * 60e3 },
    log: { tool: "", hits: [3, 4], loot: { wood: [2, 4] }, regrow: 2 * 3600e3 },
    rock: { tool: "pick", hits: [9, 13], loot: { stone: [3, 6], flint: [0, 2], clay: [0, 1] }, ore: { cu: [0.35, 1, 2], ag: [0.05, 1, 1] }, regrow: 4 * 3600e3 },
    // hunting: the dinosaur is the node (the page keeps it in front of you and takes its bites out of your HP)
    raptor: { tool: "spear", hits: [10, 14], loot: { hide: [2, 3], bone: [1, 2], meat: [2, 3] }, regrow: 30 * 60e3 },
    trike: { tool: "spear", hits: [24, 32], loot: { hide: [4, 6], bone: [2, 4], meat: [5, 8] }, regrow: 60 * 60e3 },
    alpha: { tool: "spear", hits: [60, 80], loot: { hide: [6, 8], bone: [4, 6], meat: [6, 9], amber: [1, 2], fang: [1, 1] }, regrow: 6 * 3600e3 },
    spino: { tool: "spear", hits: [44, 58], loot: { hide: [5, 7], bone: [3, 5], meat: [6, 9], fang: [0, 1] }, regrow: 2 * 3600e3 },
    claw: { tool: "spear", hits: [18, 24], loot: { hide: [3, 4], bone: [2, 3], meat: [3, 4], fang: [0, 1] }, regrow: 45 * 60e3 },
    titan: { tool: "spear", hits: [70, 90], loot: { hide: [8, 11], bone: [6, 8], meat: [8, 12], amber: [1, 3] }, regrow: 6 * 3600e3 },
    // b-jx3: the Ember Basin (the second land: hot, a heat cloak keeps you in it) — obsidian rocks and sulfur vents
    obsidian: { tool: "pick", hits: [12, 16], loot: { obsidian: [2, 4], stone: [1, 2], sulfur: [0, 1] }, regrow: 4 * 3600e3 },
    vent: { tool: "", hits: [2, 3], loot: { sulfur: [1, 3] }, regrow: 40 * 60e3 },
    // fishing at the lake (a rod): reeling in is the swings, and a fish takes at least a few seconds (wait)
    fish: { tool: "rod", hits: [6, 9], loot: { fish: [1, 2] }, regrow: 90e3, wait: 4000 },
    // b-jy7: the Mire (the third land, west of the plain): reeds, mud and its hunter; fossil dig sites on the ridges'
    // feet (brushed, a few seconds each); meteors that fall in a meteor shower (only while it's on)
    reed: { tool: "", hits: [1, 2], loot: { reed: [2, 4], fiber: [0, 2] }, regrow: 25 * 60e3 },
    mire: { tool: "", hits: [3, 4], loot: { clay: [1, 3], reed: [0, 1] }, regrow: 40 * 60e3 },
    stalker: { tool: "spear", hits: [22, 30], loot: { hide: [3, 5], bone: [2, 3], meat: [3, 4], venom: [1, 2] }, regrow: 45 * 60e3 },
    fossil: { tool: "", hits: [8, 10], loot: { fossil: [1, 1], bone: [1, 2], amber: [0, 1] }, regrow: 3 * 3600e3, wait: 6000 },
    meteor: { tool: "pick", hits: [5, 7], loot: { stone: [1, 2], amber: [0, 1] }, ore: { au: [0.5, 1, 1], ag: [0.6, 1, 2] }, regrow: 30 * 60e3, event: "meteor" },
  },
  // the hunt points on the week's board (b-jx3): a bigger dinosaur counts for more
  HUNT_PTS: { raptor: 1, claw: 2, trike: 3, stalker: 4, spino: 6, alpha: 10, titan: 12 },
  SPEAR: [1.4, 1, 0.75],
  // the axe: bare hands are slow; a stone axe, then copper, then iron
  AXE: [2.4, 1, 0.72, 0.5],
  // what you can make, what it costs, where (a workbench must stand on your plot for "bench")
  RECIPES: {
    axe1: { name: "Stone axe", need: { wood: 3, stone: 2, fiber: 2 }, tool: ["axe", 1] },
    torch: { name: "Torch", need: { wood: 2, fiber: 1 }, give: { torch: 1 } },
    axe2: { name: "Copper axe", need: { wood: 5, cu: 8 }, at: "bench", tool: ["axe", 2] },
    spear: { name: "Spear", need: { wood: 6, flint: 3, fiber: 2 }, at: "bench", tool: ["spear", 1] },
    rope: { name: "Rope", need: { fiber: 6 }, give: { rope: 1 } },
    axe3: { name: "Iron-hard axe", need: { hardwood: 4, ag: 6, rope: 1 }, at: "bench", tool: ["axe", 3] },
    cook: { name: "Cooked meat", need: { meat: 1, wood: 1 }, at: "fire", give: { cooked: 1 } },
    // b-jx3: the second half
    rod: { name: "Fishing rod", need: { wood: 4, fiber: 6, rope: 1 }, tool: ["rod", 1] },
    cookfish: { name: "Grilled fish", need: { fish: 1, wood: 1 }, at: "fire", give: { grilled: 1 } },
    armor: { name: "Hide armour", need: { hide: 10, bone: 6, rope: 2 }, at: "bench", tool: ["armor", 1] },
    cloak: { name: "Heat cloak", need: { hide: 6, fiber: 8, bone: 2 }, at: "bench", tool: ["cloak", 1] },
    spear2: { name: "Obsidian spear", need: { obsidian: 6, hardwood: 2, rope: 1 }, at: "bench", tool: ["spear", 2] },
    bomb: { name: "Sulfur flare", need: { sulfur: 3, fiber: 2, torch: 1 }, give: { flare: 1 } },
    // b-jy7: the Mire's — boots against its poison water, an antidote, and a bola to calm a dinosaur for taming
    boots: { name: "Swamp boots", need: { hide: 4, reed: 6, rope: 1 }, at: "bench", tool: ["boots", 1] },
    antidote: { name: "Antidote", need: { berries: 3, reed: 2 }, give: { antidote: 1 } },
    bola: { name: "Bola", need: { rope: 1, stone: 3 }, give: { bola: 1 } },
  },
  // the camps: 20 spots round the gate, one per player as they come (the first 20); after that there's no spot of your
  // own, and you join someone's camp (up to CAMP_MEMBERS living there, the owner included) and build there
  CAMPS: [[17, 67], [30, 47], [25, 25], [5, 12], [-17, 17], [-30, 37], [-25, 59], [0, 92], [35, 77], [50, 38], [-4, -8], [-35, 7], [-50, 46], [-35, 77], [12, 111], [35, 103], [54, 87], [66, 66], [68, 24], [-18, -26]],
  CAMP_R: 9, CAMP_MEMBERS: 5,
  // building pieces on your plot (1 m grid, rotations 0–3): cost each; the bench and the fire are placed like pieces
  PIECES: {
    bench: { name: "Workbench", need: { wood: 20, stone: 10 }, station: "bench" }, campfire: { name: "Campfire", need: { wood: 6, stone: 8 }, station: "fire" },
    hut: { name: "Hut", need: { wood: 40, stone: 12, fiber: 10 } }, bed: { name: "Bed", need: { wood: 15, fiber: 10 } }, chest: { name: "Chest", need: { wood: 12, stone: 2 } },
    fence: { name: "Fence", need: { wood: 3 } }, wall: { name: "Wall", need: { wood: 6 } }, floor: { name: "Floor", need: { wood: 4 } }, torchpost: { name: "Torch post", need: { wood: 3, torch: 1 } },
  },
  FOOD: { berries: 12, meat: 25, cooked: 45, fish: 15, grilled: 40, antidote: 30 },
  // b-jy7: taming — a bola and 3 berries a try, a chance by kind; one try every few seconds
  TAME: { trike: 0.6, raptor: 0.4, stalker: 0.3, cost: { bola: 1, berries: 3 }, gap: 4000 },
  // b-jy7: a camp's likes (one a week from each visitor) and notes (one of six fixed lines a day, twelve kept)
  CAMP: { NOTES: 6, KEEP: 12 },
  // b-jx2: the boss hour — twice a day (Seoul 12:00 and 20:00) for 30 minutes the Alpha Raptor (noon) or the Thornback
  // Titan (evening) is enraged: one HP for everyone there, each hunter's swings count (no faster than real ones). When it
  // falls, everyone who struck it 10 times or more takes a hunter's share (materials and amber, and — b-jy4, the owner's
  // list — a little ARCL for having taken part: the same 10 hits, never more for doing more)
  BOSS: { at: [[12, "alpha"], [20, "titan"]], len: 30 * 60e3, hp: { alpha: 600, titan: 800 }, min: 10, post: 20, arcl: { alpha: 200, titan: 300 },
    share: { alpha: { hide: [5, 7], bone: [4, 6], amber: [2, 3], fang: [1, 2] }, titan: { hide: [7, 9], bone: [5, 7], amber: [3, 4], fang: [1, 2] } } },
  // the daily missions (b-jx1): taking part, not winning; 300 ARCL each, once a day (Seoul's day), inside the shop's cap
  // b-jy4: a night raid held at your camp (all three waves: 8 raiders hunted) pays once a night (two "nights" a Seoul day)
  RAID: { need: 8, arcl: 150 },
  // b-jy3: who's hunting here — your spot every few seconds into small documents per 20-second window (sharded by wallet,
  // like the town's wanderers), read back merged and kept a moment in memory (so a hundred hunters aren't a hundred reads)
  HERE: { LIFE: 20e3, SHARDS: 6, MEMO: 2500, MAX: 24, PING_MS: 10e3, R: 260 },
  MIS: { gather: { need: 60, arcl: 300, name: "Gather 60 materials" }, make: { need: 3, arcl: 300, name: "Make or build 3 things" }, cook: { need: 2, arcl: 300, name: "Cook 2 meals" } },
};
// the room each piece takes: no two overlapping (a floor can go under the rest); a hut is hollow: a bed, a chest, a torch
// post or a workbench fits inside it (clear of its walls)
const RAD = { hut: 2.2, bench: 1.1, campfire: 0.8, bed: 1, chest: 0.6, fence: 0.7, wall: 0.7, floor: 0, torchpost: 0.3 }, INSIDE = { bed: 1, chest: 1, torchpost: 1, bench: 1 };
export function clash(k1, x1, z1, k2, x2, z2) {
  const r1 = RAD[k1] ?? 0.6, r2 = RAD[k2] ?? 0.6; if (!r1 || !r2) return false; const d = Math.hypot(x1 - x2, z1 - z2);
  const inHut = (r, dx, dz) => Math.abs(dx) + r * 0.5 <= 1.75 && Math.abs(dz) + r * 0.5 <= 1.75; // (the hut is a 4 m square: clear of its walls)
  if (k1 === "hut" && INSIDE[k2] && inHut(r2, x2 - x1, z2 - z1)) return false; if (k2 === "hut" && INSIDE[k1] && inHut(r1, x1 - x2, z1 - z2)) return false;
  return d < (r1 + r2) * 0.8;
}
const ORE = ["cu", "ag", "au"];
const MATS = ["wood", "hardwood", "stone", "flint", "clay", "fiber", "berries", "amber", "hide", "bone", "meat", "cooked", "torch", "rope", "fang", "obsidian", "sulfur", "fish", "grilled", "flare", "reed", "venom", "fossil", "bola", "antidote"];
/// b-jy7: the land's weather events — every two hours from 00:30 Seoul time, eight minutes: a storm, then (two hours on)
/// a meteor shower, by turns (world-jurx.js keeps the same clock)
export const WEATHER = { EVERY: 2 * 3600e3, AT: 30 * 60e3, LEN: 8 * 60e3 };
export function weatherAt(t) { const k = t + 9 * 3600e3 - WEATHER.AT, slot = Math.floor(k / WEATHER.EVERY), into = k - slot * WEATHER.EVERY; return { kind: slot % 2 ? "meteor" : "storm", on: into < WEATHER.LEN, start: slot * WEATHER.EVERY - 9 * 3600e3 + WEATHER.AT, slot }; }

/// deps: { getDocs, setDoc, commit, json, now, signer(b), isGM(w), random?, mine: { addOre, oreOf, takeOre }, dino?: { assist, hunt, gather } }
export function makeJur(deps) {
  const { getDocs, setDoc, json, signer } = deps;
  const now = () => deps.now();
  const rnd = deps.random || (() => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296);
  const one = async (p) => (await getDocs([p]))[p];
  const day = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
  const fresh = () => ({ mat: Object.fromEntries(MATS.map((k) => [k, 0])), tools: { axe: 0, spear: 0, rod: 0, armor: 0, cloak: 0, boots: 0 }, stations: {}, felled: {}, work: null, day: "", got: 0 });
  async function invOf(w) { const v = (await one(`worldJurInv/${w}`)) || {}, f = fresh(); return { ...f, ...v, mat: { ...f.mat, ...(v.mat || {}) }, tools: { ...f.tools, ...(v.tools || {}) }, stations: { ...(v.stations || {}) }, felled: { ...(v.felled || {}) } }; }
  // today's missions: what counts (the gathering is the day's count already kept), and which are paid
  const misOf = (inv) => { const d = day(now()); if (!inv.mis || inv.mis.day !== d) inv.mis = { day: d, made: 0, cooked: 0, paid: [] }; if (inv.day !== d) { inv.day = d; inv.got = 0; } return inv.mis; };
  const misView = (inv) => { const m = misOf(inv), have = { gather: inv.got || 0, make: m.made || 0, cook: m.cooked || 0 };
    return Object.entries(JUR.MIS).map(([key, M]) => ({ key, name: M.name, need: M.need, n: Math.min(M.need, have[key]), arcl: M.arcl, paid: (m.paid || []).includes(key) })); };
  const pub = (inv) => ({ mat: inv.mat, tools: inv.tools, stations: inv.stations, got: inv.day === day(now()) ? inv.got : 0, cap: JUR.DAY_CAP, mis: misView(inv), hunted: { ...(inv.hunted || {}) }, tamed: { ...(inv.tamed || {}) } });
  /// the missions done and not yet paid: paid now (a create-only marker: once a day each, even from two tabs)
  async function payMis(w, inv) {
    const out = []; if (!deps.credit) return out;
    for (const x of misView(inv)) { if (x.paid || x.n < x.need) continue;
      if (!(await deps.commit([{ create: `worldJurPay/${w}_${inv.mis.day}_${x.key}`, data: { at: now() } }])).ok) { inv.mis.paid = [...(inv.mis.paid || []), x.key]; continue; }
      const n = await deps.credit(w, "jur", x.arcl).catch(() => 0); inv.mis.paid = [...(inv.mis.paid || []), x.key]; out.push({ key: x.key, n }); }
    return out;
  }
  // the plot's pieces as the page needs them (compact)
  async function plotOf(w) { const p = (await one(`worldJurPlot/${w}`)) || {}; return Array.isArray(p.pieces) ? p.pieces : []; }
  const gm = (w) => !!(deps.isGM && deps.isGM(w));
  async function signed(b) { const s = signer(b); if (s.err) return { err: s.err }; return { w: s.wallet }; } // (open to every signed-in wallet)
  const idOk = (id) => typeof id === "string" && /^[a-z0-9:_.-]{3,48}$/i.test(id);
  const between = ([a, b]) => a + Math.floor(rnd() * (b - a + 1));
  const prune = (felled, t) => { const out = {}; const live = Object.entries(felled).filter(([, u]) => u > t).sort((a, b) => b[1] - a[1]).slice(0, JUR.FELLED_MAX); for (const [k, u] of live) out[k] = u; return out; };

  // the camps' registry: one doc a spot, worldJurCamp/<slot> { w, members } — made with an atomic create, so two players
  // claiming at the same moment can't both get one spot (the first version kept them all in worldJurCamps/all: read too)
  const campsDoc = async () => {
    const ks = JUR.CAMPS.map((_, i) => `worldJurCamp/${i}`), d = await getDocs([...ks, "worldJurCamps/all"]), old = d["worldJurCamps/all"] || {};
    const owners = [], members = {};
    JUR.CAMPS.forEach((_, i) => { const c = d[ks[i]]; if (c && c.w) { owners[i] = c.w; members[i] = Array.isArray(c.members) ? c.members : []; } else if (Array.isArray(old.owners) && old.owners[i]) { owners[i] = old.owners[i]; members[i] = (old.members && old.members[i]) || []; } });
    return { owners, members };
  };
  const homeOf = (inv, C) => { const h = inv.home; return Number.isInteger(h) && h >= 0 && h < JUR.CAMPS.length && C.owners[h] ? h : -1; };
  const shortW = (w) => (w ? w.slice(0, 6) + "…" + w.slice(-4) : "");
  async function campsView(w) {
    const C = await campsDoc(), list = [];
    const plots = await getDocs(C.owners.filter(Boolean).map((o) => `worldJurPlot/${o}`));
    JUR.CAMPS.forEach(([x, z], i) => { const o = C.owners[i]; if (!o) return; const p = plots[`worldJurPlot/${o}`] || {};
      list.push({ slot: i, x, z, owner: shortW(o), mine: o === w, members: 1 + ((C.members[i] || []).length), pieces: Array.isArray(p.pieces) ? p.pieces.slice(0, JUR.PLOT_MAX) : [] }); });
    return { list, free: JUR.CAMPS.length - C.owners.filter(Boolean).length };
  }
  // claim a spot (the first free one), or join someone's camp when they're all taken
  async function camp(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, op = String(b.op || ""), inv = await invOf(w), C = await campsDoc();
    if (homeOf(inv, C) >= 0) return json(200, { ok: true, home: homeOf(inv, C), camps: await campsView(w) });
    if (op === "claim") {
      for (let i = 0; i < JUR.CAMPS.length; i++) { if (C.owners[i]) continue;
        if (!(await deps.commit([{ create: `worldJurCamp/${i}`, data: { w, members: [], at: now() } }])).ok) continue; // taken a moment ago: the next one
        inv.home = i; await setDoc(`worldJurInv/${w}`, inv); return json(200, { ok: true, home: i, camps: await campsView(w) }); }
      return json(409, { error: "every camp spot is taken — join someone's camp", full: true, camps: await campsView(w) });
    }
    if (op === "join") {
      const i = Math.round(Number(b.slot)); if (!C.owners[i]) return json(400, { error: "nobody camps there" });
      const m = C.members[i] || []; if (1 + m.length >= JUR.CAMP_MEMBERS) return json(409, { error: "that camp is full" });
      await setDoc(`worldJurCamp/${i}`, { w: C.owners[i], members: [...m, w], at: now() }); inv.home = i; await setDoc(`worldJurInv/${w}`, inv);
      return json(200, { ok: true, home: i, camps: await campsView(w) });
    }
    return json(400, { error: "claim or join" });
  }
  // the plot you build on and craft at: your home camp's (its owner's)
  async function homePlot(w, inv) { const C = await campsDoc(), h = homeOf(inv, C); return h < 0 ? null : { owner: C.owners[h], slot: h }; }
  async function view(w) {
    const inv = await invOf(w), t = now(), ore = deps.mine ? await deps.mine.oreOf(w) : null;
    return json(200, { ok: true, gm: gm(w), inv: pub(inv), ore: ore && ore.inv, pick: ore ? { tier: ore.tier, k: ore.k } : null, felled: prune(inv.felled, t), recipes: JUR.RECIPES, pieces: JUR.PIECES, home: homeOf(inv, await campsDoc()), camps: await campsView(w) });
  }
  // the first swing at a node: how many it takes (the server's roll), from when
  async function start(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, node = String(b.node || ""), kind = String(b.kind || ""), N = JUR.NODES[kind]; if (!idOk(node) || !N) return json(400, { error: "which one?" });
    const inv = await invOf(w), t = now(); if ((inv.felled[node] || 0) > t) return json(409, { error: "it's not back yet", regrowAt: inv.felled[node] });
    if (inv.work && inv.work.node === node && t - inv.work.at < 10 * 60e3) return json(200, { ok: true, need: inv.work.need, at: inv.work.at });
    if (N.tool === "rod" && !(inv.tools.rod | 0)) return json(400, { error: "make a fishing rod first" });
    if (N.event) { const ev = weatherAt(t); if (!ev.on || ev.kind !== N.event) return json(409, { error: "the meteor shower is over" }); }
    let k = 1; if (N.tool === "axe") k = JUR.AXE[Math.max(0, Math.min(3, inv.tools.axe | 0))]; else if (N.tool === "pick") k = deps.mine ? (await deps.mine.oreOf(w)).k : 1; else if (N.tool === "spear") k = JUR.SPEAR[Math.max(0, Math.min(2, inv.tools.spear | 0))];
    // a dinosaur companion out with you (world-dino.js) takes its share of a hunt's swings (api/_world-dino.mjs)
    const share = b.buddy && N.tool === "spear" && deps.dino ? await deps.dino.assist(w).catch(() => 0) : 0;
    const raw = between(N.hits) * k, need = Math.max(1, Math.round(raw * (1 - share))), saved = share > 0 ? Math.max(0, Math.round(raw) - need) : 0;
    inv.work = { node, kind, need, at: t, buddy: share > 0, saved }; await setDoc(`worldJurInv/${w}`, inv);
    return json(200, { ok: true, need, at: t, saved });
  }
  // the node breaks: only after its swings could have been made; the drop goes in your pack (ore in the mine's pockets)
  async function brk(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, node = String(b.node || ""), inv = await invOf(w), t = now(), W = inv.work;
    if (!W || W.node !== node) return json(400, { error: "start on it first" });
    const N = JUR.NODES[W.kind]; if (t - W.at < Math.max(N.wait || 0, Math.max(0, W.need - 1) * JUR.HIT_MS * JUR.SLACK)) return json(429, { error: "too fast" });
    misOf(inv);
    if (inv.got >= JUR.DAY_CAP) { inv.work = null; await setDoc(`worldJurInv/${w}`, inv); return json(429, { error: "that's a full day's gathering — rest and come back tomorrow" }); }
    const loot = {}; for (const [m, r] of Object.entries(N.loot)) { const n = between(r); if (n > 0) { loot[m] = n; inv.mat[m] = (inv.mat[m] || 0) + n; inv.got += n; } }
    let ore = null;
    if (N.ore && deps.mine) { const add = {}; for (const [k, [p, lo, hi]] of Object.entries(N.ore)) if (rnd() < p) add[k] = between([lo, hi]); if (Object.keys(add).length) { ore = await deps.mine.addOre(w, add); loot.ore = add; } }
    inv.felled = prune({ ...inv.felled, [node]: t + N.regrow }, t); inv.work = null;
    if (N.tool === "spear") inv.hunted = { ...(inv.hunted || {}), [W.kind]: ((inv.hunted || {})[W.kind] || 0) + 1 }; // (the goal card's later steps: a triceratops, the bosses)
    { const m = /^raid:(\d{8}[ab]):\d{1,3}$/.exec(node); if (m && W.kind === "raptor") inv.raid = { k: m[1], n: (inv.raid && inv.raid.k === m[1] ? inv.raid.n || 0 : 0) + 1 }; } // (b-jy4: the night's raiders hunted)
    const paid = await payMis(w, inv);
    await setDoc(`worldJurInv/${w}`, inv);
    if (JUR.HUNT_PTS[W.kind]) await board(w, JUR.HUNT_PTS[W.kind]).catch(() => { /* the hunt stands */ });
    // the companion's experience: a hunt it helped with, or a little for gathering with it out
    let buddy = null; if (deps.dino && (W.buddy || b.buddy)) buddy = await (N.tool === "spear" && W.buddy ? deps.dino.hunt(w, W.kind) : deps.dino.gather(w)).catch(() => null);
    return json(200, { ok: true, loot, ore, inv: pub(inv), regrowAt: t + N.regrow, buddy, saved: (buddy && W.saved) || 0, paid });
  }
  // ---------------- the week's hunters (b-jx3): hunt points, the top 20 ----------------
  const week = () => (deps.isoWeek ? deps.isoWeek(now()) : day(now()).slice(0, 7));
  async function board(w, pts) {
    const wk = week(), bk = `worldJurWeek/${wk}_${w}`, key = `worldStats/jurWeek_${wk}`, [mine, cur] = await Promise.all([one(bk), one(key)]);
    const n = ((mine && mine.n) || 0) + pts; await setDoc(bk, { n });
    const name = (((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16);
    const top = [{ w: shortW(w), id: w, n, name }, ...(((cur && cur.top) || []).filter((x) => x.id !== w))].sort((a, b) => b.n - a.n).slice(0, 20);
    await setDoc(key, { top });
    // b-jy3: your crew's hunt points this week too (a crew-vs-crew board)
    const cm = await one(`worldCrewOf/${w}`); if (cm && cm.id) { const c = await one(`worldCrew/${cm.id}`); if (c) { const ck = `worldStats/jurCrewWeek_${wk}`, cc = (await one(ck)) || {}, was = ((cc.top || []).find((x) => x.id === cm.id) || {}).n || 0;
      await setDoc(ck, { top: [{ id: cm.id, tag: String(c.tag || "").slice(0, 6), name: String(c.name || "").slice(0, 20), n: was + pts }, ...((cc.top || []).filter((x) => x.id !== cm.id))].sort((a, b2) => b2.n - a.n).slice(0, 20) }); } }
  }
  // ---------------- the boss hour (b-jx2) ----------------
  /// the hour at time t: the one running (on) or the next one
  function bossAt(t) {
    const B = JUR.BOSS, k = t + 9 * 3600e3, d0 = Math.floor(k / 864e5) * 864e5;
    for (const off of [-1, 0, 1]) for (const [h, kind] of B.at) { const start = d0 + off * 864e5 + h * 3600e3 - 9 * 3600e3, end = start + B.len;
      if (t >= start && t < end) return { on: true, id: day(start) + "_" + h, kind, start, end }; }
    let next = null; for (const off of [0, 1]) for (const [h, kind] of B.at) { const start = d0 + off * 864e5 + h * 3600e3 - 9 * 3600e3; if (start > t && (!next || start < next.start)) next = { on: false, id: day(start) + "_" + h, kind, start, end: start + B.len }; }
    return next;
  }
  async function bossView(w) {
    const t = now(), b = bossAt(t), max = JUR.BOSS.hp[b.kind];
    const ks = [`worldJurBoss/${b.id}`, `worldJurBossDown/${b.id}`, `worldJurBossTop/${b.id}`, ...(w ? [`worldJurBossHit/${b.id}_${w}`, `worldJurBossPaid/${b.id}_${w}`] : [])], d = await getDocs(ks);
    const B = d[ks[0]] || {}, dealt = B.dealt || 0, dn = d[ks[1]], down = dn ? dn.at : 0, me = w ? d[ks[3]] : null, top = ((d[ks[2]] || {}).top || []).slice(0, 5);
    return { ...b, max, hp: Math.max(0, max - dealt), hunters: B.hunters || 0, down, top, ...(dn && dn.by ? { by: dn.by } : {}), arcl: JUR.BOSS.arcl[b.kind] || 0, mine: w ? { n: (me && me.n) || 0, need: JUR.BOSS.min, paid: !!d[ks[4]] } : null, now: t };
  }
  async function bossHit(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, t = now(), B = bossAt(t); if (!B.on) return json(409, { error: "the boss hour isn't on" });
    const pk = `worldJurBossHit/${B.id}_${w}`, [me, dn] = await Promise.all([one(pk), one(`worldJurBossDown/${B.id}`)]);
    if (dn) return json(200, { ok: true, ...(await bossView(w)) });
    // no more swings than the time since your last post allows (and no more than POST at a time)
    const last = (me && me.last) || t - JUR.BOSS.post * JUR.HIT_MS, can = Math.min(JUR.BOSS.post, Math.floor((t - last) / (JUR.HIT_MS * JUR.SLACK)) + 1);
    const n = Math.max(0, Math.min(can, Math.floor(Number(b.n) || 0))); if (!n) return json(200, { ok: true, ...(await bossView(w)) });
    if (!me) { if (!(await deps.commit([{ create: pk, data: { n, last: t } }, { inc: `worldJurBoss/${B.id}`, fields: { dealt: n, hunters: 1 } }])).ok) return json(409, { error: "one moment" }); }
    else { await setDoc(pk, { n: (me.n || 0) + n, last: t }); await deps.commit([{ inc: `worldJurBoss/${B.id}`, fields: { dealt: n } }]); }
    // b-jy3: the hunters with the most hits (the MVP card when it falls)
    { const tk = `worldJurBossTop/${B.id}`, cur = (await one(tk)) || {}, id = shortW(w), mine = ((me && me.n) || 0) + n;
      await setDoc(tk, { top: [{ id, name: await nameOf(w), n: mine }, ...((cur.top || []).filter((x) => x.id !== id))].sort((a, c) => c.n - a.n).slice(0, 8) }).catch(() => {}); }
    const v = await bossView(w); if (v.hp <= 0 && !v.down) { if ((await deps.commit([{ create: `worldJurBossDown/${B.id}`, data: { at: t, by: shortW(w), byName: await nameOf(w) } }]).catch(() => ({ ok: false }))).ok) v.by = shortW(w); v.down = t; }
    return json(200, { ok: true, ...v });
  }
  async function bossClaim(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, id = String(b.id || ""); if (!/^\d{4}-\d{2}-\d{2}_\d{1,2}$/.test(id)) return json(400, { error: "which hour?" });
    const kind = (JUR.BOSS.at.find(([h]) => String(h) === id.split("_")[1]) || [])[1]; if (!kind) return json(400, { error: "which hour?" });
    const d = await getDocs([`worldJurBossDown/${id}`, `worldJurBossHit/${id}_${w}`]);
    if (!d[`worldJurBossDown/${id}`]) return json(409, { error: "it hasn't fallen yet" });
    const me = d[`worldJurBossHit/${id}_${w}`]; if (!me || (me.n || 0) < JUR.BOSS.min) return json(403, { error: "strike it " + JUR.BOSS.min + " times to share the hunt" });
    if (!(await deps.commit([{ create: `worldJurBossPaid/${id}_${w}`, data: { at: now() } }])).ok) return json(409, { error: "you took your share already" });
    const inv = await invOf(w), loot = {}; for (const [m, r] of Object.entries(JUR.BOSS.share[kind])) { const n = between(r); if (n > 0) { loot[m] = n; inv.mat[m] = (inv.mat[m] || 0) + n; } }
    inv.hunted = { ...(inv.hunted || {}), [kind]: ((inv.hunted || {})[kind] || 0) + 1 };
    await setDoc(`worldJurInv/${w}`, inv); await board(w, JUR.HUNT_PTS[kind] || 0).catch(() => {});
    const arcl = deps.credit && JUR.BOSS.arcl[kind] ? await deps.credit(w, "jur", JUR.BOSS.arcl[kind]).catch(() => 0) : 0;
    return json(200, { ok: true, loot, inv: pub(inv), kind, arcl });
  }
  async function read(v, url) {
    const w = String((url && url.searchParams && url.searchParams.get("wallet")) || "").toLowerCase();
    if (v === "jur-boss") return json(200, { ok: true, ...(await bossView(/^0x[0-9a-f]{40}$/.test(w) ? w : "")) }, "no-store");
    if (v === "jur-camp") { const c = await campInfo(Math.round(Number(url && url.searchParams && url.searchParams.get("slot")))); return c ? json(200, { ok: true, ...c }, "no-store") : json(404, { error: "nobody camps there" }); }
    if (v === "jur-top") { const wk = week(), d = await getDocs([`worldStats/jurWeek_${wk}`, `worldStats/jurCrewWeek_${wk}`]), a0 = d[`worldStats/jurWeek_${wk}`], c0 = d[`worldStats/jurCrewWeek_${wk}`];
      const cp = await one(`worldStats/jurCampWeek_${wk}`);
      return json(200, { week: wk, top: ((a0 && a0.top) || []).map(({ w: a, name, n }) => ({ w: a, name: name || "", n })), crews: ((c0 && c0.top) || []).slice(0, 10).map(({ tag, name, n }) => ({ tag, name, n })), camps: ((cp && cp.top) || []).slice(0, 10).map(({ slot, name, owner, n }) => ({ slot, name: name || owner, n })) }, "public, max-age=30"); }
    return null;
  }
  /// materials taken from a pack for something else (the dinosaur egg's care, its food): { ok, inv } or { err }
  async function take(w, need) {
    const inv = await invOf(w); if (!Object.entries(need).every(([k, n]) => (inv.mat[k] || 0) >= n)) return { err: "not enough", need };
    for (const [k, n] of Object.entries(need)) inv.mat[k] -= n; await setDoc(`worldJurInv/${w}`, inv); return { ok: true, inv: pub(inv) };
  }
  /// materials brought in from outside (an agent's errand, api/_world-agent.mjs): only the kinds the pack knows
  async function give(w, got) {
    const inv = await invOf(w); for (const [k, n] of Object.entries(got || {})) if (MATS.includes(k) && n > 0) inv.mat[k] = (inv.mat[k] || 0) + Math.floor(n);
    await setDoc(`worldJurInv/${w}`, inv); return { ok: true, inv: pub(inv) };
  }
  const hasAll = (inv, need, ore) => Object.entries(need).every(([k, n]) => (ORE.includes(k) ? (ore && ore[k]) || 0 : inv.mat[k] || 0) >= n);
  async function pay(w, inv, need) {
    const oreNeed = Object.fromEntries(Object.entries(need).filter(([k]) => ORE.includes(k)));
    let ore = null; if (Object.keys(oreNeed).length) { ore = deps.mine ? await deps.mine.takeOre(w, oreNeed) : null; if (!ore) return { err: json(400, { error: "not enough ore", need }) }; }
    for (const [k, n] of Object.entries(need)) if (!ORE.includes(k)) inv.mat[k] -= n;
    return { ore };
  }
  async function craft(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, R = JUR.RECIPES[String(b.recipe || "")]; if (!R) return json(400, { error: "which recipe?" });
    const inv = await invOf(w), oreNow = deps.mine ? (await deps.mine.oreOf(w)).inv : {};
    if (R.at) { const hp = await homePlot(w, inv), pcs = hp ? await plotOf(hp.owner) : [];
      if (R.at === "bench" && !pcs.some((p) => p.k === "bench")) return json(400, { error: "build a workbench at your camp first" });
      if (R.at === "fire" && !pcs.some((p) => p.k === "campfire")) return json(400, { error: "build a campfire at your camp first" }); }
    if (R.tool && (inv.tools[R.tool[0]] | 0) >= R.tool[1]) return json(409, { error: "you have this one or better" });
    if (!hasAll(inv, R.need, oreNow)) return json(400, { error: "not enough materials", need: R.need });
    const P = await pay(w, inv, R.need); if (P.err) return P.err;
    if (R.tool) inv.tools[R.tool[0]] = R.tool[1];
    if (R.give) for (const [k, n] of Object.entries(R.give)) inv.mat[k] = (inv.mat[k] || 0) + n;
    const m = misOf(inv); m.made = (m.made || 0) + 1; if (String(b.recipe) === "cook") m.cooked = (m.cooked || 0) + 1;
    const paid = await payMis(w, inv);
    await setDoc(`worldJurInv/${w}`, inv);
    return json(200, { ok: true, inv: pub(inv), ore: P.ore || oreNow, paid });
  }
  // the plot: pieces on a 1 m grid round your camp (x, z in −PLOT_R…PLOT_R, y levels 0–3, rotation 0–3)
  async function build(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, op = String(b.op || ""), pc = b.piece || {}, P = JUR.PIECES[String(pc.k || "")];
    const x = Math.round(Number(pc.x)), z = Math.round(Number(pc.z)), r = ((Math.round(Number(pc.r) || 0) % 4) + 4) % 4;
    if (!P || !Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) > JUR.PLOT_R) return json(400, { error: "that can't go there" });
    const inv = await invOf(w), hp = await homePlot(w, inv); if (!hp) return json(400, { error: "you have no camp yet" });
    const pieces = await plotOf(hp.owner), at = pieces.findIndex((p) => p.x === x && p.z === z);
    if (op === "remove") {
      if (at < 0) return json(404, { error: "nothing there" });
      if (pieces[at].by && pieces[at].by !== w && hp.owner !== w) return json(403, { error: "only who built it, or the camp's owner, can take it down" });
      const [old] = pieces.splice(at, 1), back = JUR.PIECES[old.k] || {};
      for (const [k, n] of Object.entries(back.need || {})) inv.mat[k] = (inv.mat[k] || 0) + Math.floor(n / 2); // half back
      await setDoc(`worldJurPlot/${hp.owner}`, { pieces }); await setDoc(`worldJurInv/${w}`, inv);
      return json(200, { ok: true, plot: pieces, slot: hp.slot, inv: pub(inv) });
    }
    if (op !== "place") return json(400, { error: "place or remove" });
    // the room each piece takes: no two overlapping (a floor can go under the rest)
    if (at >= 0 || pieces.some((p) => clash(pc.k, x, z, p.k, p.x, p.z))) return json(409, { error: "something's there" });
    if (pieces.length >= JUR.PLOT_MAX) return json(400, { error: "the camp is full" });
    if (P.station && pieces.some((p) => p.k === pc.k)) return json(409, { error: "the camp has one already" });
    if (!hasAll(inv, P.need, {})) return json(400, { error: "not enough materials", need: P.need });
    for (const [k, n] of Object.entries(P.need)) inv.mat[k] -= n;
    pieces.push({ k: pc.k, x, z, r, by: w }); const m = misOf(inv); m.made = (m.made || 0) + 1; const paid = await payMis(w, inv);
    await setDoc(`worldJurPlot/${hp.owner}`, { pieces }); await setDoc(`worldJurInv/${w}`, inv);
    return json(200, { ok: true, plot: pieces, slot: hp.slot, inv: pub(inv), paid });
  }
  // eating: berries, raw or cooked meat fill the hunger bar (the page keeps the bar; the food comes off the pack here)
  async function eat(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, f = String(b.food || ""), fed = JUR.FOOD[f]; if (!fed) return json(400, { error: "that's not food" });
    const inv = await invOf(w); if ((inv.mat[f] || 0) < 1) return json(400, { error: "none left" });
    inv.mat[f] -= 1; await setDoc(`worldJurInv/${w}`, inv);
    return json(200, { ok: true, inv: pub(inv), fed });
  }
  // ---------------- b-jy3: who's hunting here ----------------
  const names = new Map(); // wallet → { n, at } (the save's name, read again every 10 minutes)
  async function nameOf(w) { const c = names.get(w); if (c && now() - c.at < 600e3) return c.n; const n = String(((await one(`worldSave/${w}`)) || {}).name || "").slice(0, 16); names.set(w, { n, at: now() }); if (names.size > 2000) names.clear(); return n; }
  const shard = (w) => parseInt(w.slice(-4), 16) % JUR.HERE.SHARDS;
  let hereMemo = { at: 0, list: [] };
  async function hereList(t) {
    if (t - hereMemo.at < JUR.HERE.MEMO) return hereMemo.list;
    const H = JUR.HERE, win = Math.floor(t / H.LIFE), keys = []; for (const k of [win, win - 1]) for (let i = 0; i < H.SHARDS; i++) keys.push(`worldJurHere/${k}_${i}`);
    const d = await getDocs(keys), seen = new Map();
    for (const k of keys) for (const y of ((d[k] || {}).list || [])) if (t - y.at < H.LIFE && (!seen.has(y.id) || seen.get(y.id).at < y.at)) seen.set(y.id, y);
    hereMemo = { at: t, list: [...seen.values()].sort((a, b) => b.at - a.at).slice(0, H.MAX) }; return hereMemo.list;
  }
  async function here(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, t = now(), H = JUR.HERE, x = Math.round(Number(b.x) * 10) / 10, z = Math.round(Number(b.z) * 10) / 10;
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) > H.R) return json(400, { error: "where?" });
    const id = shortW(w), key = `worldJurHere/${Math.floor(t / H.LIFE)}_${shard(w)}`, cur = (await one(key)) || { list: [] }, old = (cur.list || []).find((y) => y.id === id) || {};
    const pk = Number.isInteger(b.pk) && b.pk >= 1 && b.pk <= 3 ? b.pk : 0, hp = Number.isInteger(b.hp) && b.hp >= 0 && b.hp <= 100 ? b.hp : 100;
    const e = { id, n: await nameOf(w), lv: Math.max(1, Math.min(500, Math.floor(Number(b.lv) || 1))), c: /^[a-z0-9-]{1,24}$/.test(String(b.c || "")) ? b.c : "bot", x, z, f: Math.round((Number(b.f) || 0) * 100) / 100, hp, at: t,
      ...(pk ? { pk, pa: t, px: x, pz: z } : old.pa && t - old.pa < H.PING_MS ? { pk: old.pk, pa: old.pa, px: old.px, pz: old.pz } : {}) };
    await setDoc(key, { list: [e, ...(cur.list || []).filter((y) => y.id !== id)].slice(0, 12) });
    hereMemo.list = [e, ...hereMemo.list.filter((y) => y.id !== id)]; // (your own spot right away, in this instance's memory)
    const list = (await hereList(t)).filter((y) => y.id !== id).map(({ at, pa, ...y }) => ({ ...y, ago: t - at, ...(pa && t - pa < H.PING_MS ? { pa: t - pa } : { pk: undefined, px: undefined, pz: undefined }) }));
    return json(200, { ok: true, list, now: t });
  }
  // ---------------- b-jy7: taming ----------------
  async function tame(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, kind = String(b.kind || ""), p = JUR.TAME[kind], t = now(); if (typeof p !== "number") return json(400, { error: "that one can't be tamed" });
    const inv = await invOf(w); if (t - (inv.tameAt || 0) < JUR.TAME.gap) return json(429, { error: "one moment" });
    if (!Object.entries(JUR.TAME.cost).every(([k, n]) => (inv.mat[k] || 0) >= n)) return json(400, { error: "a bola and 3 berries", need: JUR.TAME.cost });
    for (const [k, n] of Object.entries(JUR.TAME.cost)) inv.mat[k] -= n;
    const ok = rnd() < p; inv.tameAt = t; if (ok) inv.tamed = { ...(inv.tamed || {}), [kind]: ((inv.tamed || {})[kind] || 0) + 1 };
    await setDoc(`worldJurInv/${w}`, inv);
    return json(200, { ok: true, tamed: ok, inv: pub(inv) });
  }
  // ---------------- b-jy7: camps you visit: a like a week, a note a day ----------------
  async function campInfo(slot) {
    const wk = week(), C = await campsDoc(), o = C.owners[slot]; if (!o) return null;
    const d = await getDocs([`worldJurBook/${slot}`, `worldStats/jurCampWeek_${wk}`]), top = ((d[`worldStats/jurCampWeek_${wk}`] || {}).top || []);
    return { slot, owner: shortW(o), name: await nameOf(o), members: 1 + (C.members[slot] || []).length, likes: (top.find((x) => x.slot === slot) || {}).n || 0, notes: ((d[`worldJurBook/${slot}`] || {}).list || []).slice(0, JUR.CAMP.KEEP) };
  }
  async function like(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, slot = Math.round(Number(b.slot)), C = await campsDoc(); if (!C.owners[slot]) return json(400, { error: "nobody camps there" });
    if (C.owners[slot] === w || (C.members[slot] || []).includes(w)) return json(400, { error: "that's your own camp" });
    const wk = week(); if (!(await deps.commit([{ create: `worldJurLike/${wk}_${slot}_${w}`, data: { at: now() } }])).ok) return json(409, { error: "liked this week already" });
    const k = `worldStats/jurCampWeek_${wk}`, cur = (await one(k)) || {}, was = ((cur.top || []).find((x) => x.slot === slot) || {}).n || 0;
    await setDoc(k, { top: [{ slot, owner: shortW(C.owners[slot]), name: await nameOf(C.owners[slot]), n: was + 1 }, ...((cur.top || []).filter((x) => x.slot !== slot))].sort((a, c) => c.n - a.n).slice(0, 20) });
    return json(200, { ok: true, likes: was + 1 });
  }
  async function note(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, slot = Math.round(Number(b.slot)), tt = Math.round(Number(b.t)), C = await campsDoc(); if (!C.owners[slot]) return json(400, { error: "nobody camps there" });
    if (!(tt >= 0 && tt < JUR.CAMP.NOTES)) return json(400, { error: "which line?" });
    if (!(await deps.commit([{ create: `worldJurNote/${day(now())}_${slot}_${w}`, data: { at: now() } }])).ok) return json(409, { error: "one note a day here" });
    const k = `worldJurBook/${slot}`, cur = (await one(k)) || {}, list = [{ t: tt, n: await nameOf(w), at: now() }, ...(cur.list || [])].slice(0, JUR.CAMP.KEEP);
    await setDoc(k, { list }); return json(200, { ok: true, notes: list });
  }
  // ---------------- b-jy4: a night raid held ----------------
  const nightKey = (t) => { const d = new Date(t + 9 * 3600e3); return d.toISOString().slice(0, 10).replace(/-/g, "") + (d.getUTCHours() < 6 ? "a" : "b"); };
  async function raidClaim(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, t = now(), key = String(b.key || ""); if (key !== nightKey(t) && key !== nightKey(t - 3 * 3600e3)) return json(400, { error: "which night?" });
    const inv = await invOf(w), r = inv.raid || {}; if (r.k !== key || (r.n || 0) < JUR.RAID.need) return json(403, { error: "hold all three waves first", n: r.k === key ? r.n || 0 : 0, need: JUR.RAID.need });
    if (!(await deps.commit([{ create: `worldJurRaidPaid/${w}_${key}`, data: { at: t } }])).ok) return json(409, { error: "paid for tonight already" });
    const n = deps.credit ? await deps.credit(w, "jur", JUR.RAID.arcl).catch(() => 0) : 0;
    return json(200, { ok: true, arcl: n });
  }
  return {
    take, give,
    view,
    read,
    async handle(b) {
      if (b.action === "world-jur-start") return start(b);
      if (b.action === "world-jur-break") return brk(b);
      if (b.action === "world-jur-craft") return craft(b);
      if (b.action === "world-jur-build") return build(b);
      if (b.action === "world-jur-eat") return eat(b);
      if (b.action === "world-jur-camp") return camp(b);
      if (b.action === "world-jur-boss-hit") return bossHit(b);
      if (b.action === "world-jur-boss-claim") return bossClaim(b);
      if (b.action === "world-jur-here") return here(b);
      if (b.action === "world-jur-raid-claim") return raidClaim(b);
      if (b.action === "world-jur-tame") return tame(b);
      if (b.action === "world-jur-like") return like(b);
      if (b.action === "world-jur-note") return note(b);
      return null;
    },
  };
}
