// api/_world-jur.mjs — Jurassic World's survival (world-jurassic.js): gathering, crafting and building on your own plot.
// GM wallets only until the owner opens it (isGM). What you gather is decided here: how many swings a tree or rock
// takes (by your tool), when it can break (no faster than real swings), what it drops, when it grows back; a day's
// gathering has a cap (bots). Ore from Jurassic rocks goes into the ARCL Mine's pockets (worldMineInv: one ore bag for
// both worlds), and the mine's pickaxe (tier and +level) is the one you mine with here. No ARCL is paid here (yet).
//
//   GET  ?world=jur&wallet=0x…                                   → { ok, inv, ore, pick, felled, recipes, plot }
//   POST { action: "world-jur-start", …signature, node, kind }   → { need, at }          (the first swing at a node)
//   POST { action: "world-jur-break", …signature, node }         → { loot, ore?, inv, regrowAt }
//   POST { action: "world-jur-craft", …signature, recipe }       → { inv, ore }
//   POST { action: "world-jur-build", …signature, op, piece }    → { plot, inv }          (place / remove on your plot)
//   POST { action: "world-jur-eat",   …signature, food }         → { inv, fed }
//
// Firestore: worldJurInv/<wallet> { mat, tools, stations, felled, work, day, got } · worldJurPlot/<wallet> { pieces }
export const JUR = {
  HIT_MS: 430, SLACK: 0.7, DAY_CAP: 6000, FELLED_MAX: 500, PLOT_MAX: 400, PLOT_R: 26,
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
  },
  SPEAR: [2.2, 1],
  // the axe: bare hands are slow; a stone axe, then copper, then iron
  AXE: [2.4, 1, 0.72, 0.5],
  // what you can make, what it costs, where (a workbench must stand on your plot for "bench")
  RECIPES: {
    axe1: { name: "Stone axe", need: { wood: 3, stone: 2, fiber: 2 }, tool: ["axe", 1] },
    torch: { name: "Torch", need: { wood: 2, fiber: 1 }, give: { torch: 1 } },
    bench: { name: "Workbench", need: { wood: 20, stone: 10 }, station: "bench" },
    axe2: { name: "Copper axe", need: { wood: 5, cu: 8 }, at: "bench", tool: ["axe", 2] },
    spear: { name: "Spear", need: { wood: 6, flint: 3, fiber: 2 }, at: "bench", tool: ["spear", 1] },
    rope: { name: "Rope", need: { fiber: 6 }, give: { rope: 1 } },
    axe3: { name: "Iron-hard axe", need: { hardwood: 4, ag: 6, rope: 1 }, at: "bench", tool: ["axe", 3] },
    cook: { name: "Cooked meat", need: { meat: 1, wood: 1 }, at: "fire", give: { cooked: 1 } },
  },
  // building pieces on your plot (1 m grid, rotations 0–3): cost each; the bench and the fire are placed like pieces
  PIECES: {
    floor: { need: { wood: 4 } }, wall: { need: { wood: 6 } }, door: { need: { wood: 8, fiber: 2 } }, roof: { need: { wood: 5, fiber: 2 } },
    fence: { need: { wood: 3 } }, campfire: { need: { wood: 6, stone: 8 } }, bed: { need: { wood: 15, fiber: 10 } }, chest: { need: { wood: 12, stone: 2 } },
    bench: { need: {}, station: "bench" },
  },
  FOOD: { berries: 12, meat: 25, cooked: 45 },
};
const ORE = ["cu", "ag", "au"];
const MATS = ["wood", "hardwood", "stone", "flint", "clay", "fiber", "berries", "amber", "hide", "bone", "meat", "cooked", "torch", "rope", "fang"];

/// deps: { getDocs, setDoc, commit, json, now, signer(b), isGM(w), random?, mine: { addOre, oreOf, takeOre } }
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
  async function signed(b) { const s = signer(b); if (s.err) return { err: s.err }; if (!gm(s.wallet)) return { err: json(403, { error: "Jurassic World is coming soon" }) }; return { w: s.wallet }; }
  const idOk = (id) => typeof id === "string" && /^[a-z0-9:_.-]{3,48}$/i.test(id);
  const between = ([a, b]) => a + Math.floor(rnd() * (b - a + 1));
  const prune = (felled, t) => { const out = {}; const live = Object.entries(felled).filter(([, u]) => u > t).sort((a, b) => b[1] - a[1]).slice(0, JUR.FELLED_MAX); for (const [k, u] of live) out[k] = u; return out; };

  async function view(w) {
    const inv = await invOf(w), t = now(), ore = deps.mine ? await deps.mine.oreOf(w) : null;
    return json(200, { ok: true, gm: gm(w), inv: pub(inv), ore: ore && ore.inv, pick: ore ? { tier: ore.tier, k: ore.k } : null, felled: prune(inv.felled, t), recipes: JUR.RECIPES, pieces: JUR.PIECES, plot: await plotOf(w) });
  }
  // the first swing at a node: how many it takes (the server's roll), from when
  async function start(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, node = String(b.node || ""), kind = String(b.kind || ""), N = JUR.NODES[kind]; if (!idOk(node) || !N) return json(400, { error: "which one?" });
    const inv = await invOf(w), t = now(); if ((inv.felled[node] || 0) > t) return json(409, { error: "it's not back yet", regrowAt: inv.felled[node] });
    if (inv.work && inv.work.node === node && t - inv.work.at < 10 * 60e3) return json(200, { ok: true, need: inv.work.need, at: inv.work.at });
    let k = 1; if (N.tool === "axe") k = JUR.AXE[Math.max(0, Math.min(3, inv.tools.axe | 0))]; else if (N.tool === "pick") k = deps.mine ? (await deps.mine.oreOf(w)).k : 1; else if (N.tool === "spear") k = JUR.SPEAR[Math.max(0, Math.min(1, inv.tools.spear | 0))];
    const need = Math.max(1, Math.round(between(N.hits) * k));
    inv.work = { node, kind, need, at: t }; await setDoc(`worldJurInv/${w}`, inv);
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
    return json(200, { ok: true, loot, ore, inv: pub(inv), regrowAt: t + N.regrow });
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
    if (R.at === "bench" && inv.stations.bench !== "placed") return json(400, { error: "build a workbench on your plot first" });
    if (R.at === "fire" && !(await plotOf(w)).some((p) => p.k === "campfire")) return json(400, { error: "build a campfire on your plot first" });
    if (R.tool && (inv.tools[R.tool[0]] | 0) >= R.tool[1]) return json(409, { error: "you have this one or better" });
    if (!hasAll(inv, R.need, oreNow)) return json(400, { error: "not enough materials", need: R.need });
    const P = await pay(w, inv, R.need); if (P.err) return P.err;
    if (R.tool) inv.tools[R.tool[0]] = R.tool[1];
    if (R.give) for (const [k, n] of Object.entries(R.give)) inv.mat[k] = (inv.mat[k] || 0) + n;
    if (R.station) inv.stations[R.station] = "ready"; // a station to place on your plot (the build menu places it)
    await setDoc(`worldJurInv/${w}`, inv);
    return json(200, { ok: true, inv: pub(inv), ore: P.ore || oreNow });
  }
  // the plot: pieces on a 1 m grid round your camp (x, z in −PLOT_R…PLOT_R, y levels 0–3, rotation 0–3)
  async function build(b) {
    const S = await signed(b); if (S.err) return S.err;
    const w = S.w, op = String(b.op || ""), pc = b.piece || {}, P = JUR.PIECES[String(pc.k || "")];
    const x = Math.round(Number(pc.x)), z = Math.round(Number(pc.z)), y = Math.max(0, Math.min(3, Math.round(Number(pc.y) || 0))), r = ((Math.round(Number(pc.r) || 0) % 4) + 4) % 4;
    if (!P || !Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > JUR.PLOT_R || Math.abs(z) > JUR.PLOT_R) return json(400, { error: "that can't go there" });
    const inv = await invOf(w), pieces = await plotOf(w), at = pieces.findIndex((p) => p.x === x && p.z === z && p.y === y && p.k === pc.k && (pc.k !== "wall" && pc.k !== "door" && pc.k !== "fence" ? true : p.r % 2 === r % 2));
    if (op === "remove") {
      if (at < 0) return json(404, { error: "nothing there" });
      const [old] = pieces.splice(at, 1), back = JUR.PIECES[old.k] || {};
      for (const [k, n] of Object.entries(back.need || {})) inv.mat[k] = (inv.mat[k] || 0) + Math.floor(n / 2); // half back
      if (back.station) inv.stations[back.station] = "ready";
      await setDoc(`worldJurPlot/${w}`, { pieces }); await setDoc(`worldJurInv/${w}`, inv);
      return json(200, { ok: true, plot: pieces, inv: pub(inv) });
    }
    if (op !== "place") return json(400, { error: "place or remove" });
    if (at >= 0) return json(409, { error: "something's there" });
    if (pieces.length >= JUR.PLOT_MAX) return json(400, { error: "your plot is full" });
    if (P.station && inv.stations[P.station] !== "ready") return json(400, { error: "make it first" });
    if (!hasAll(inv, P.need, {})) return json(400, { error: "not enough materials", need: P.need });
    for (const [k, n] of Object.entries(P.need)) inv.mat[k] -= n;
    if (P.station) inv.stations[P.station] = "placed";
    pieces.push({ k: pc.k, x, y, z, r }); await setDoc(`worldJurPlot/${w}`, { pieces }); await setDoc(`worldJurInv/${w}`, inv);
    return json(200, { ok: true, plot: pieces, inv: pub(inv) });
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
    view,
    async handle(b) {
      if (b.action === "world-jur-start") return start(b);
      if (b.action === "world-jur-break") return brk(b);
      if (b.action === "world-jur-craft") return craft(b);
      if (b.action === "world-jur-build") return build(b);
      if (b.action === "world-jur-eat") return eat(b);
      return null;
    },
  };
}
