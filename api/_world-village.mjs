// api/_world-village.mjs — your island as a village: a design score, village XP and level, the village centre's level
// (the client draws it), the blessing a level gives, and the weekly village contest.
//
//   score   worked out here from the saved build (bricks, kinds, colours, height, shop pieces, trophies, lights,
//           plants, theme, island size) so it can't be claimed; likes add to XP, not to the score
//   XP      grows by each new best score, and by 10 for each like; it keeps growing whatever the level
//   level   1–4 follow XP; from 5 on, each level also needs a Village upgrade paid in $ARCIRCLE (isleup in the shop):
//           5: 1,000 · 6: 2,000 · 7: 4,000 · 8: 7,000 · 9: 11,000 · 10: 16,000 … (each step 1,000 more than the last)
//   contest each ISO week: you enter your village; the GM wallet picks the winners and their ARCL (the first week:
//           50,000 ARCL); the results stay readable for everyone
//
//   GET  ?world=village&wallet=0x…      score, XP, level, the next level's XP and price, the blessing
//   GET  ?world=contest                 this week's entries (best first) and the last weeks' winners
//   POST { action: "world-contest-enter", …signature }              enter this week (your island must have bricks)
//   POST { action: "world-contest-pick", …signature, week, winners: [{ wallet, arcl }] }   the GM only, once a week
const lc = (s) => String(s || "").toLowerCase();
const isAddr = (s) => /^0x[0-9a-f]{40}$/.test(lc(s));
// the game master: picks the contest winners and every event's results (and wears [GM] in gold)
export const GM_WALLETS = ["0x1250fe3b1de11da51457bca3fc8840f4ab4aeac1"];
export const isGM = (w) => GM_WALLETS.includes(lc(w));
export const VILLAGE_MAX = 30, PAY_FROM = 5;
// XP to reach a level: 2: 100 · 3: 300 · 4: 600 · 5: 1,000 · 6: 1,500 … (50 × (L−1) × L)
export const needXp = (L) => (L <= 1 ? 0 : 50 * (L - 1) * L);
export const xpLevel = (xp) => { let L = 1; while (L < VILLAGE_MAX && xp >= needXp(L + 1)) L++; return L; };
// $ARCIRCLE for a level from 5 up: 1,000, 2,000, 4,000, 7,000, 11,000, 16,000, …
export const upCost = (L) => (L < PAY_FROM ? 0 : 1000 + 1000 * (((L - PAY_FROM) * (L - PAY_FROM + 1)) / 2));
// the level you have: XP alone up to 4; past that only as far as you've paid (and your XP reaches)
export const villageLevel = (xp, paid) => { const byXp = xpLevel(xp); return byXp < PAY_FROM ? byXp : Math.min(byXp, Math.max(PAY_FROM - 1, paid || 0)); };
// the village blessing: +2% XP and +1% max HP a level (from level 2), up to +40% and +20%
export const blessing = (L) => ({ xp: Math.min(40, Math.max(0, L - 1) * 2), hp: Math.min(20, Math.max(0, L - 1)) });

// mirrors world-island.js TYPES (index → id) for the score; ids past the list count as plain bricks
const KIND = ["brick", "plate", "tile", "slope", "stairs", "pillar", "wall", "roof", "peak", "fence", "window", "door", "water", "tree", "bush", "flowers", "grass", "rock", "lamp", "bench", "arch", "roundwin", "glass", "dome", "chimney", "pine", "lantern", "table", "planter", "neon", "crystal", "sign", "flag", "neoncube", "goldbrick", "rings", "rocket", "dish", "crown", "trophy", "keycard", "neonpanel", "holo", "neonsign", "lightpillar", "sand", "coral", "palm", "lighthouse", "hull", "porthole", "antenna", "satdish", "mgrass", "mstone", "mwood", "mmetal", "mglass", "mneon", "mcrystal", "mgold", "mcyber", "marcadia", "r_gable", "r_hip", "r_cone", "r_cap", "r_awning", "r_tiles", "f_bed", "f_sofa", "f_table", "f_chair", "f_bookcase", "f_tv", "f_rug", "f_floorlamp", "f_plant", "f_wardrobe", "f_frame", "f_counter", "l_lantern", "l_string", "l_torch", "l_floor", "l_ceiling", "d_fence", "d_sign", "d_banner", "d_flag", "d_mailbox", "d_fountain", "d_bench", "d_lamp"];
const LIGHT = new Set(["lamp", "lantern", "neon", "neoncube", "neonpanel", "neonsign", "lightpillar", "holo", "crystal", "l_lantern", "l_string", "l_torch", "l_floor", "l_ceiling", "d_lamp", "f_floorlamp"]);
const PLANT = new Set(["tree", "bush", "flowers", "grass", "pine", "planter", "palm", "coral", "f_bed", "f_sofa", "f_table", "f_chair", "f_bookcase", "f_tv", "f_rug", "f_floorlamp", "f_plant", "f_wardrobe", "f_frame", "f_counter"]); // furniture weighs like plants
const TROPHY = new Set(["rings", "rocket", "dish", "crown", "trophy", "keycard", "goldbrick"]);
const SHOP0 = KIND.indexOf("neonpanel"), SHOP1 = KIND.indexOf("marcadia"); // the shop packs are the run neonpanel…marcadia; kinds appended after it are free
const SHOPK = (id) => { const i = KIND.indexOf(id); return i >= SHOP0 && i <= SHOP1; };
/// the design score of a saved build (base64 of [1, N, (x, y, z, kind, rot|colour<<2) × n])
export function villageScore(data, theme = "") {
  let bin = ""; try { bin = atob(String(data || "")); } catch { return { score: 0, parts: {} }; }
  if (bin.length < 2) return { score: 0, parts: {} };
  const N = bin.charCodeAt(1), n = (bin.length - 2) / 5, kinds = new Set(), colours = new Set();
  let top = 0, light = 0, plant = 0, shop = 0; const trophies = new Set();
  for (let i = 2; i + 4 < bin.length; i += 5) {
    const y = bin.charCodeAt(i + 1), k = KIND[bin.charCodeAt(i + 3)] || "brick", col = bin.charCodeAt(i + 4) >> 2;
    kinds.add(k); colours.add(col); top = Math.max(top, y + 1);
    if (LIGHT.has(k)) light++; if (PLANT.has(k)) plant++; if (SHOPK(k)) shop++; if (TROPHY.has(k)) trophies.add(k);
  }
  const parts = {
    bricks: Math.round(Math.min(n, 1500) + Math.max(0, Math.min(n, 6000) - 1500) * 0.25),
    kinds: kinds.size * 25, colours: Math.min(colours.size, 24) * 15, height: Math.min(top, 32) * 10,
    shop: Math.min(shop * 3, 600), trophies: trophies.size * 40, lights: Math.min(light * 2, 200), plants: Math.min(plant, 300),
    theme: theme ? 150 : 0, size: N >= 64 ? 400 : N >= 48 ? 200 : 0,
  };
  return { score: n ? Object.values(parts).reduce((a, b) => a + b, 0) : 0, parts };
}

export function makeVillage(deps) {
  const { getDocs, setDoc, json, signer } = deps;
  const now = () => deps.now();
  const one = async (p) => (await getDocs([p]))[p];
  const week = () => (deps.isoWeek ? deps.isoWeek(now()) : "w");
  const paidOf = async (w) => ((deps.own ? await deps.own(w) : null) || {}).isleLv || 0;
  async function view(w) {
    const isl = (await one(`worldIsland/${w}`)) || {}, paid = await paidOf(w), xp = isl.vxp || 0, L = villageLevel(xp, paid);
    const next = Math.min(VILLAGE_MAX, L + 1), canPay = next >= PAY_FROM && xp >= needXp(next) && L === Math.max(PAY_FROM - 1, paid) && L < VILLAGE_MAX;
    return { wallet: w, score: isl.vscore || 0, best: isl.vbest || 0, parts: isl.vparts || {}, xp, level: L, paid, max: VILLAGE_MAX, next: L < VILLAGE_MAX ? next : null, need: L < VILLAGE_MAX ? needXp(next) : null, cost: upCost(next), payable: canPay, blessing: blessing(L), gm: isGM(w) };
  }
  /// a save: the new score; XP grows by a new best (the island doc is written by the caller with these fields)
  function onSave(old, data, theme) {
    const { score, parts } = villageScore(data, theme), best = (old && old.vbest) || 0, xp = ((old && old.vxp) || 0) + Math.max(0, score - best);
    return { vscore: score, vparts: parts, vbest: Math.max(best, score), vxp: xp };
  }
  async function onLike(target) {
    const k = `worldIsland/${target}`, isl = await one(k); if (!isl) return;
    await setDoc(k, { ...isl, vxp: (isl.vxp || 0) + 10 });
  }
  /// the shop's Village upgrade: whether it can be bought now, and what it costs
  async function nextUp(w) { const v = await view(w); return v.payable ? { next: v.next, tokens: v.cost } : { why: v.level >= VILLAGE_MAX ? "your village is as big as it gets" : v.next < PAY_FROM ? "your village grows by itself until level 4" : `your village needs ${needXp(v.next).toLocaleString("en-US")} XP for level ${v.next} (it has ${v.xp.toLocaleString("en-US")})` }; }

  // ---- the weekly contest ----
  async function contest() {
    const wk = week(), cur = (await one(`worldContest/${wk}`)) || { entries: [] }, past = (await one("worldStats/contests")) || { list: [] };
    const ws = (cur.entries || []).map((e) => e.w), docs = ws.length ? await getDocs(ws.map((w) => `worldIsland/${w}`).concat(ws.map((w) => `worldIslandLikes/${w}`))) : {};
    const entries = (cur.entries || []).map((e) => { const isl = docs[`worldIsland/${e.w}`] || {}; return { wallet: e.w, name: isl.name || e.name || "", score: isl.vscore || 0, likes: (docs[`worldIslandLikes/${e.w}`] || {}).n || 0, n: isl.n || 0, at: e.at }; })
      .sort((a, b) => b.score + b.likes * 20 - (a.score + a.likes * 20));
    return { week: wk, entries, winners: cur.winners || null, prize: cur.winners ? null : (past.list || []).length ? 30000 : 50000, past: (past.list || []).slice(0, 8), gm: GM_WALLETS };
  }
  async function enter(b) {
    const s = signer(b); if (s.err) return s.err;
    if (isGM(s.wallet)) return json(400, { error: "the GM judges the contest and doesn't enter it" });
    const isl = await one(`worldIsland/${s.wallet}`); if (!isl || !(isl.n > 0)) return json(400, { error: "build something on your island first" });
    const wk = week(), k = `worldContest/${wk}`, cur = (await one(k)) || { entries: [] };
    if (cur.winners) return json(400, { error: "this week's contest is already judged" });
    if ((cur.entries || []).some((e) => e.w === s.wallet)) return json(200, { ok: true, already: true, contest: await contest() });
    await setDoc(k, { ...cur, entries: [...(cur.entries || []), { w: s.wallet, name: isl.name || "", at: now() }].slice(-300) });
    return json(200, { ok: true, contest: await contest() });
  }
  async function pick(b) {
    const s = signer(b); if (s.err) return s.err;
    if (!isGM(s.wallet)) return json(403, { error: "only the GM picks the winners" });
    const wk = String(b.week || week()), k = `worldContest/${wk}`, cur = (await one(k)) || { entries: [] };
    if (cur.winners) return json(409, { error: "this week already has its winners" });
    const list = (Array.isArray(b.winners) ? b.winners : []).slice(0, 3).map((x) => ({ w: lc(x && x.wallet), arcl: Math.max(0, Math.floor(Number(x && x.arcl) || 0)) }));
    if (!list.length || list.some((x) => !isAddr(x.w) || !(cur.entries || []).some((e) => e.w === x.w))) return json(400, { error: "pick from this week's entries" });
    if (new Set(list.map((x) => x.w)).size !== list.length) return json(400, { error: "each village wins once" });
    if (list.some((x) => isGM(x.w))) return json(400, { error: "the GM can't pick their own village" });
    if (list.reduce((a, x) => a + x.arcl, 0) > 100000) return json(400, { error: "at most 100,000 ARCL a week" });
    const docs = await getDocs(list.map((x) => `worldIsland/${x.w}`));
    const winners = list.map((x, i) => ({ place: i + 1, wallet: x.w, name: (docs[`worldIsland/${x.w}`] || {}).name || "", arcl: x.arcl }));
    await setDoc(k, { ...cur, winners, by: s.wallet, at: now() });
    for (const x of winners) if (x.arcl > 0 && deps.award) await deps.award(x.wallet, "contest", x.arcl).catch(() => {});
    const past = (await one("worldStats/contests")) || { list: [] };
    await setDoc("worldStats/contests", { list: [{ week: wk, winners }, ...(past.list || []).filter((p) => p.week !== wk)].slice(0, 30) });
    return json(200, { ok: true, contest: await contest() });
  }
  return {
    view, onSave, onLike, nextUp,
    async read(v, url) {
      if (v === "village") { const w = lc(url.searchParams.get("wallet")); if (!isAddr(w)) return json(400, { error: "wallet" }); return json(200, await view(w), "no-store"); }
      if (v === "contest") return json(200, await contest(), "no-store");
      return null;
    },
    async handle(b) {
      if (b.action === "world-contest-enter") return enter(b);
      if (b.action === "world-contest-pick") return pick(b);
      return null;
    },
  };
}
