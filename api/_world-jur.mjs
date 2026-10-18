// api/_world-jur.mjs — Jurassic World's survival (world-jurassic.js): gathering, crafting and building on your own plot.
// Open to every signed-in wallet (it was GM-only before launch). What you gather is decided here: how many swings a tree or rock
// takes (by your tool), when it can break (no faster than real swings), what it drops, when it grows back; a day's
// gathering has a cap (bots). Ore from Jurassic rocks goes into the ARCL Mine's pockets (worldMineInv: one ore bag for
// both worlds), and the mine's pickaxe (tier and +level) is the one you mine with here. No ARCL is paid here (yet).
//
//   GET  ?world=jur&wallet=0x…                                   → { ok, inv, ore, pick, felled, recipes, plot }
//   POST { action: "world-jur-start", …signature, node, kind }   → { need, at }          (the first swing at a node)
//   POST { action: "world-jur-break", …signature, node }         → { loot, ore?, inv, regrowAt }
//   POST { action: "world-jur-craft", …signature, recipe }       → { inv, ore }
//   POST { action: "world-jur-camp",  …signature, op: claim|join, slot? } → { home, camps }
//   POST { action: "world-jur-build", …signature, op, piece }    → { plot, inv }          (place / remove at your camp)
//   POST { action: "world-jur-eat",   …signature, food }         → { inv, fed }
//
// Firestore: worldJurInv/<wallet> { mat, tools, felled, work, day, got, home } · worldJurPlot/<owner> { pieces } · worldJurCamp/<slot> { w, members }
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
  },
  SPEAR: [1.4, 1],
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
  FOOD: { berries: 12, meat: 25, cooked: 45 },
};
const ORE = ["cu", "ag", "au"];
const MATS = ["wood", "hardwood", "stone", "flint", "clay", "fiber", "berries", "amber", "hide", "bone", "meat", "cooked", "torch", "rope", "fang"];

/// deps: { getDocs, setDoc, commit, json, now, signer(b), isGM(w), random?, mine: { addOre, oreOf, takeOre }, dino?: { assist, hunt, gather } }
export function makeJur(deps) {
  const { getDocs, setDoc, json, signer } = deps;
  const now = () => deps.now();
  const rnd = deps.random || (() => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296);
  const one = async (p) => (await getDocs([p]))[p];
  const day = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
  const fresh = () => ({ mat: Object.fromEntries(MATS.map((k) => [k, 0])), tools: { axe: 0, spear: 0 }, stations: {}, felled: {}, work: null, day: "", got: 0 });
  async function invOf(w) { const v = (await one(`worldJurInv/${w}`)) || {}, f = fresh(); return { ...f, ...v, mat: { ...f.mat, ...(v.mat || {}) }, tools: { ...f.tools, ...(v.tools || {}) }, stations: { ...(v.stations || {}) }, felled: { ...(v.felled || {}) } }; }
  const pub = (inv) => ({ mat: inv.mat, tools: inv.tools, stations: inv.stations, got: inv.day === day(now()) ? inv.got : 0, cap: JUR.DAY_CAP });
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
    let k = 1; if (N.tool === "axe") k = JUR.AXE[Math.max(0, Math.min(3, inv.tools.axe | 0))]; else if (N.tool === "pick") k = deps.mine ? (await deps.mine.oreOf(w)).k : 1; else if (N.tool === "spear") k = JUR.SPEAR[Math.max(0, Math.min(1, inv.tools.spear | 0))];
    // a dinosaur companion out with you (world-dino.js) takes its share of a hunt's swings (api/_world-dino.mjs)
    const share = b.buddy && N.tool === "spear" && deps.dino ? await deps.dino.assist(w).catch(() => 0) : 0;
    const need = Math.max(1, Math.round(between(N.hits) * k * (1 - share)));
    inv.work = { node, kind, need, at: t, buddy: share > 0 }; await setDoc(`worldJurInv/${w}`, inv);
    return json(200, { ok: true, need, at: t });
  }
  // the node breaks: only after its swings could have been made; the drop goes in your pack (ore in the mine's pockets)
  async function brk(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, node = String(b.node || ""), inv = await invOf(w), t = now(), W = inv.work;
    if (!W || W.node !== node) return json(400, { error: "start on it first" });
    const N = JUR.NODES[W.kind]; if (t - W.at < Math.max(0, W.need - 1) * JUR.HIT_MS * JUR.SLACK) return json(429, { error: "too fast" });
    const d = day(t); if (inv.day !== d) { inv.day = d; inv.got = 0; }
    if (inv.got >= JUR.DAY_CAP) { inv.work = null; await setDoc(`worldJurInv/${w}`, inv); return json(429, { error: "that's a full day's gathering — rest and come back tomorrow" }); }
    const loot = {}; for (const [m, r] of Object.entries(N.loot)) { const n = between(r); if (n > 0) { loot[m] = n; inv.mat[m] = (inv.mat[m] || 0) + n; inv.got += n; } }
    let ore = null;
    if (N.ore && deps.mine) { const add = {}; for (const [k, [p, lo, hi]] of Object.entries(N.ore)) if (rnd() < p) add[k] = between([lo, hi]); if (Object.keys(add).length) { ore = await deps.mine.addOre(w, add); loot.ore = add; } }
    inv.felled = prune({ ...inv.felled, [node]: t + N.regrow }, t); inv.work = null;
    await setDoc(`worldJurInv/${w}`, inv);
    // the companion's experience: a hunt it helped with, or a little for gathering with it out
    let buddy = null; if (deps.dino && (W.buddy || b.buddy)) buddy = await (N.tool === "spear" && W.buddy ? deps.dino.hunt(w, W.kind) : deps.dino.gather(w)).catch(() => null);
    return json(200, { ok: true, loot, ore, inv: pub(inv), regrowAt: t + N.regrow, buddy });
  }
  /// materials taken from a pack for something else (the dinosaur egg's care, its food): { ok, inv } or { err }
  async function take(w, need) {
    const inv = await invOf(w); if (!Object.entries(need).every(([k, n]) => (inv.mat[k] || 0) >= n)) return { err: "not enough", need };
    for (const [k, n] of Object.entries(need)) inv.mat[k] -= n; await setDoc(`worldJurInv/${w}`, inv); return { ok: true, inv: pub(inv) };
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
    await setDoc(`worldJurInv/${w}`, inv);
    return json(200, { ok: true, inv: pub(inv), ore: P.ore || oreNow });
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
    const RAD = { hut: 2.2, bench: 1.1, campfire: 0.8, bed: 1, chest: 0.6, fence: 0.7, wall: 0.7, floor: 0, torchpost: 0.3 }, rr = RAD[pc.k] ?? 0.6;
    if (at >= 0 || (rr && pieces.some((p) => (RAD[p.k] ?? 0.6) && Math.hypot(p.x - x, p.z - z) < (rr + (RAD[p.k] ?? 0.6)) * 0.8))) return json(409, { error: "something's there" });
    if (pieces.length >= JUR.PLOT_MAX) return json(400, { error: "the camp is full" });
    if (P.station && pieces.some((p) => p.k === pc.k)) return json(409, { error: "the camp has one already" });
    if (!hasAll(inv, P.need, {})) return json(400, { error: "not enough materials", need: P.need });
    for (const [k, n] of Object.entries(P.need)) inv.mat[k] -= n;
    pieces.push({ k: pc.k, x, z, r, by: w }); await setDoc(`worldJurPlot/${hp.owner}`, { pieces }); await setDoc(`worldJurInv/${w}`, inv);
    return json(200, { ok: true, plot: pieces, slot: hp.slot, inv: pub(inv) });
  }
  // eating: berries, raw or cooked meat fill the hunger bar (the page keeps the bar; the food comes off the pack here)
  async function eat(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, f = String(b.food || ""), fed = JUR.FOOD[f]; if (!fed) return json(400, { error: "that's not food" });
    const inv = await invOf(w); if ((inv.mat[f] || 0) < 1) return json(400, { error: "none left" });
    inv.mat[f] -= 1; await setDoc(`worldJurInv/${w}`, inv);
    return json(200, { ok: true, inv: pub(inv), fed });
  }
  return {
    take,
    view,
    async handle(b) {
      if (b.action === "world-jur-start") return start(b);
      if (b.action === "world-jur-break") return brk(b);
      if (b.action === "world-jur-craft") return craft(b);
      if (b.action === "world-jur-build") return build(b);
      if (b.action === "world-jur-eat") return eat(b);
      if (b.action === "world-jur-camp") return camp(b);
      return null;
    },
  };
}
