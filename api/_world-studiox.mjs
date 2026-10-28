// api/_world-studiox.mjs — OBBY WORLD's server side (2026-10-28, the owner's "easier and more premium, a Roblox feel" list):
// the director that makes or changes a 3D course from a sentence (the agent's model reads the wishes; plain rules without
// it), the creators' own Meshy assets (a prop made from words, held to a phone's triangle budget), and the remix tree
// (where a remix came from, the remixes of a game, the plays a game's remixes bring its original maker).
//   POST { action: "world-studio-obby-ai",  …signature, t, spec, build? } → { build, did, by } (AI_DAY with the Studio's other drafts)
//   POST { action: "world-studio-asset-make", …signature, t }              → { asset } (ASSET.DAY a day; needs MESHY_API_KEY on the server)
//   POST { action: "world-studio-asset-poll", …signature, id }             → { asset } (moves its Meshy tasks on: the shape, then its paint)
//   GET  ?world=studio-assets&wallet=…                                      → { assets: [{ id, name, ready, at }], open }
//   GET  ?world=studio-asset-glb&id=…                                       → the model (a fresh link from Meshy each time, cached)
//   GET  ?world=studio-remixes&id=…                                         → { chain: [ancestors], kids: [remixes], rx: plays brought to it }
// The remix records themselves are written by api/_world-studio.mjs (save with `from`, play) through remixed() / remixPlay().
//
// G2/G4 (2026-10-28, the owner: "one making system for every genre" + "tie it to the ARCIRCLE economy"):
//   PREFABS — a bundle of pieces with their rules and tracks (a boss with its health, attacks, reward and boss bar; a
//   house; a cave; an enemy camp …) saved once and placed into any game. Each carries a licence (LIC):
//     cc-by     free to use and to remix; the creator's name stays on it
//     remix     use and remix inside ARCIRCLE; a remix that sells shares REMIX_ORIG of its creator share with this one
//     personal  use in your own games only — it can't be shared again as a prefab of your own or listed
//   A prefab is free (installed by anyone, the author credited and told) or sold for ARCL: the buyer pays through the
//   Creator Market's split (api/_world-market.mjs paySale: 80 % creator / 20 % platform, 14 days pending, only the
//   PURCHASED-ARCL share settleable — ARCL spent in the game and the $ARCIRCLE exchange stay two separate policies).
//   PREMIUM TEMPLATES — a published game's maker can set a remix licence and a remix fee in ARCL: remixing it then takes
//   one purchase (the same split; a template that is itself a remix shares with its own original).
//   AI CREDITS — the director's model and Meshy assets have a free daily quota; past it a player may pay CREDIT in ARCL
//   (to the platform, in the ledger) — Meshy's paid ones still capped a day (CREDIT.ASSET_DAY) and by the shared budget.
//   SAVES — a course with "save progress" on keeps each player's checkpoint, coins, counters and what they bought.
//   POST world-studio-prefab-save { …sig, name, k, lic, price, pf, from? }   → { prefab }
//   POST world-studio-prefab-del  { …sig, id }                              → { ok }
//   POST world-studio-prefab-get  { …sig, id }                              → { prefab: { …card, pf } } (free, yours or bought)
//   POST world-studio-prefab-buy  { …sig, id, expectedPrice }               → { prefab, bal }
//   POST world-studio-game-lic    { …sig, id, lic, fee }                    → { ok } (the game's maker)
//   POST world-studio-remix-buy   { …sig, id, expectedPrice }               → { ok, bal }
//   POST world-studio-prog        { …sig, id, d | clear }                   → { ok }
//   GET  ?world=studio-prefabs[&q=&k=&sort=new|top&by=0x…&wallet=0x…]     → { items: [cards], owned: [ids] }
//   GET  ?world=studio-prog&id=&wallet=                                     → { d }
//   GET  ?world=studio-remix-ok&id=&wallet=                                 → { ok, fee, lic }
// Firestore: worldStudioPrefab/<id> · worldStudioPrefabs/<w> { ids } · worldStudioPrefabIdx/all { ids } ·
// worldStudioPfOwn/<w>_<id> · worldStudioPfUse/<id>_<w> · worldStudioRxOwn/<w>_<game> · worldStudioProg/<game>_<w> ·
// worldStudioCredit/<w>_<day>
import { clampSpec, genObbyBuild, obWants, obTweak, cleanObby, cleanPrefab, OB, PF } from "./_world-studio-gen.mjs";

export const ASSET = { DAY: 2, ALL_DAY: 40, MAX: 20, POLYS: 5000, NAME: 40, MESHY: "https://api.meshy.ai/openapi/v2/text-to-3d", GLB_MAX: 4.4e6 };
export const REMIX = { KIDS: 60, CHAIN: 6 };
export const PREFAB = { MINE: 40, IDX: 300, PRICE: [10, 50000], FEE: [0, 50000], BYTES: 60000, DAY: 12 };
export const CREDIT = { DIRECTOR: 50, ASSET: 1500, ASSET_DAY: 5 }; // (ARCL past the free quota; the owner adjusts these once the real costs are known)

export function makeStudioX(deps) {
  const { getDocs, setDoc, json, signer } = deps;
  const now = () => deps.now(), one = async (p) => (await getDocs([p]))[p];
  const day = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10); // (a Seoul day, like the Studio's drafts)
  const line = (t, n) => String(t || "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
  const key = () => (globalThis.process && process.env && process.env.MESHY_API_KEY) || "";
  const meshy = async (method, url, body) => { const f = deps.meshy || ((m, u, b) => (deps.fetch || fetch)(u, { method: m, headers: { Authorization: "Bearer " + key(), "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ ok: r.ok, status: r.status, j: await r.json().catch(() => null) })));
    return f(method, url, body); };
  const open = () => !!(deps.meshy || key());

  // ---------------- the director ----------------
  async function director(w, b) {
    const t = line(b.t, 240); if (!t) return json(400, { error: "tell the director what to make" });
    const spec = clampSpec({ ...(b.spec || {}), tpl: "obby" }), tweak = !!(b.build && b.build.ob), k = `worldStudioAi/${w}_${day(now())}`, d = (await one(k)) || {};
    let wants = null, phrases = null, by = "rules", paid = false, over = (d.n || 0) >= (deps.AI_DAY || 10);
    if (over && Number(b.pay) === 1 && deps.charge) { const c = await deps.charge(w, CREDIT.DIRECTOR, "ai-director"); if (c.error) return json(402, { error: c.error, credit: CREDIT.DIRECTOR }); paid = true; } // (G4: a credit past the free ones)
    if (!over || paid) {
      const sys = tweak ? `You edit a 3D obstacle course ("obby") in ARCIRCLE Studio. Reply with JSON only: {"do": a list of short English change phrases from this set — "add a boss", "harder ending", "easier", "more coins", "add a shop", "add checkpoints", "add spinners", "add a timer", "night look", "sunset look", "mist look", "space look", "toon look", "cinematic look", "day look"}.`
        : `You design a 3D obstacle course ("obby") in ARCIRCLE Studio from the player's words. Reply with JSON only: {"boss": bool, "shop": bool, "doors": bool, "elevator": bool, "bp": bool (a flat baseplate), "timer": seconds 0-600, "look": one of ${OB.LOOKS.join("|")}, "theme": one of neon|jungle|ice|lava|candy, "secs": 3-12 (sections), "hard": -1|0|1, "title": up to 24 characters, "mode": one of obby|combat|race|explore (combat: enemies to defeat; race: rings to fly through; explore: an open world with gems to find)}.`;
      try { const r = deps.ai ? await deps.ai(sys, [{ role: "user", content: t }]) : null, m = r && String(r).match(/\{[\s\S]*\}/); if (m) { const j = JSON.parse(m[0]); if (tweak) phrases = (Array.isArray(j.do) ? j.do : []).map((x) => line(x, 40)).slice(0, 6); else wants = j; by = "agent"; } } catch { wants = phrases = null; }
      if (by === "agent" && !paid) await setDoc(k, { n: (d.n || 0) + 1 });
    }
    const cr = over && !paid ? { over: true, credit: CREDIT.DIRECTOR } : {};
    if (tweak) { const sp = clampSpec({ ...spec, build: b.build }), r = obTweak(sp, phrases && phrases.length ? phrases.join(", ") : t); return json(200, { ok: true, build: r.build, did: r.did, by, ...cr }); }
    const rw = obWants(t), W = { ...rw, ...(wants ? { boss: !!wants.boss, shop: !!wants.shop, doors: !!wants.doors, elevator: !!wants.elevator, bp: !!wants.bp, timer: Math.max(0, Math.min(600, Math.round(Number(wants.timer) || 0))), look: OB.LOOKS.includes(wants.look) ? wants.look : rw.look, secs: Math.max(3, Math.min(12, Math.round(Number(wants.secs) || 0))) || rw.secs, hard: [-1, 0, 1].includes(wants.hard) ? wants.hard : rw.hard, theme: ["neon", "jungle", "ice", "lava", "candy"].includes(wants.theme) ? wants.theme : rw.theme, md: OB.MODES.includes(wants.mode) ? wants.mode : rw.md } : {}) };
    const sp = clampSpec({ ...spec, ...(W.theme ? { theme: W.theme } : {}), speed: Math.max(1, Math.min(5, spec.speed + W.hard)), walls: Math.max(0, Math.min(5, spec.walls + W.hard)), seed: 1 + Math.floor((deps.random || Math.random)() * 99999), ...(wants && wants.title ? { title: line(wants.title, 24) } : {}) });
    return json(200, { ok: true, build: genObbyBuild(sp, W), spec: { ...sp, build: undefined }, by, ...cr });
  }

  // ---------------- the creators' own Meshy assets ----------------
  const aid = () => "a" + String(deps.randomId()).replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12).padEnd(8, "0");
  const pubA = (id, a) => ({ id, name: a.name, ready: a.st === "done", failed: a.st === "fail", at: a.at });
  async function make(w, b) {
    if (!open()) return json(503, { error: "making assets with Meshy opens soon" });
    const t = line(b.t, ASSET.NAME * 3); if (t.length < 3) return json(400, { error: "describe the prop in a few words" });
    const dk = `worldStudioAssetDay/${w}_${day(now())}`, gk = `worldStudioAssetDay/all_${day(now())}`, d = await getDocs([dk, gk, `worldStudioAssets/${w}`]), mine = (d[`worldStudioAssets/${w}`] || {}).ids || [];
    if (((d[gk] || {}).n || 0) >= ASSET.ALL_DAY) return json(429, { error: "today's Meshy budget is used up — back tomorrow" });
    if (mine.length >= ASSET.MAX) return json(400, { error: `you can keep ${ASSET.MAX} assets` });
    let paid = false; if (((d[dk] || {}).n || 0) >= ASSET.DAY) { // (G4: the free ones used — a paid credit, a few a day)
      const ck = `worldStudioCredit/${w}_${day(now())}`, cd = (await one(ck)) || {};
      if (Number(b.pay) !== 1 || !deps.charge) return json(402, { error: `${ASSET.DAY} free assets a day — more for ${CREDIT.ASSET} ARCL each`, credit: CREDIT.ASSET });
      if ((cd.a || 0) >= CREDIT.ASSET_DAY) return json(429, { error: `${CREDIT.ASSET_DAY} paid assets a day — back tomorrow` });
      if (deps.bal && (await deps.bal(w)) < CREDIT.ASSET) return json(402, { error: "not enough ARCL", credit: CREDIT.ASSET }); paid = ck; } // (charged once Meshy takes it)
    const r = await meshy("POST", ASSET.MESHY, { mode: "preview", prompt: `${t}, a single game prop, clean stylized shape, centered`, art_style: "realistic", should_remesh: true, topology: "triangle", target_polycount: ASSET.POLYS });
    const task = r && r.ok && r.j && (r.j.result || r.j.id); if (!task) return json(502, { error: "Meshy didn't take it — try again later" });
    if (paid) { const c = await deps.charge(w, CREDIT.ASSET, "ai-asset"); if (c.error) return json(402, { error: c.error, credit: CREDIT.ASSET }); const cd = (await one(paid)) || {}; await setDoc(paid, { ...cd, a: (cd.a || 0) + 1 }); }
    const id = aid(), a = { w, name: line(t, ASSET.NAME), at: now(), st: "shape", pre: String(task) };
    await setDoc(`worldStudioAsset/${id}`, a); await setDoc(`worldStudioAssets/${w}`, { ids: [id, ...mine].slice(0, ASSET.MAX) });
    if (!paid) await setDoc(dk, { n: ((d[dk] || {}).n || 0) + 1 }); await setDoc(gk, { n: ((d[gk] || {}).n || 0) + 1 });
    return json(200, { ok: true, asset: pubA(id, a) });
  }
  async function poll(w, b) {
    const id = String(b.id || ""); if (!/^a[a-z0-9]{6,14}$/.test(id)) return json(400, { error: "no such asset" });
    const a = await one(`worldStudioAsset/${id}`); if (!a || a.w !== w) return json(404, { error: "no such asset" });
    if (a.st === "done" || a.st === "fail" || !open()) return json(200, { ok: true, asset: pubA(id, a) });
    const task = a.st === "shape" ? a.pre : a.tex, r = await meshy("GET", `${ASSET.MESHY}/${task}`), st = r && r.j && r.j.status;
    if (st === "SUCCEEDED") { if (a.st === "shape") { const q = await meshy("POST", ASSET.MESHY, { mode: "refine", preview_task_id: a.pre, enable_pbr: false }); const tx = q && q.ok && q.j && (q.j.result || q.j.id); if (tx) { a.st = "paint"; a.tex = String(tx); } else { a.st = "done"; a.bare = true; } } else a.st = "done"; await setDoc(`worldStudioAsset/${id}`, a); }
    else if (st === "FAILED" || st === "CANCELED" || st === "EXPIRED") { a.st = "fail"; await setDoc(`worldStudioAsset/${id}`, a); }
    return json(200, { ok: true, asset: pubA(id, a), progress: (r && r.j && r.j.progress) || 0 });
  }
  async function glb(id) {
    if (!/^a[a-z0-9]{6,14}$/.test(String(id))) return json(400, { error: "no such asset" });
    const a = await one(`worldStudioAsset/${id}`); if (!a || a.st !== "done" || !open()) return json(404, { error: "not ready" });
    const r = await meshy("GET", `${ASSET.MESHY}/${a.bare ? a.pre : a.tex}`), u = r && r.j && r.j.model_urls && r.j.model_urls.glb; if (!u) return json(404, { error: "not ready" });
    const raw = (status, body, headers) => (deps.raw ? deps.raw(status, body, headers) : new Response(body, { status, headers }));
    const fetchBytes = deps.fetchBytes || (async (url, max) => { try { const r = await (deps.fetch || fetch)(url); if (!r.ok) return null; const b = await r.arrayBuffer(); return b.byteLength <= max ? b : null; } catch { return null; } });
    const bytes = await fetchBytes(u, ASSET.GLB_MAX); // (passed through our own address so the page can read it, and cached at the edge once)
    if (bytes) return raw(200, bytes, { "content-type": "model/gltf-binary", "cache-control": "public, max-age=86400, s-maxage=31536000", "access-control-allow-origin": "*" });
    return raw(302, "", { location: u, "cache-control": "no-store" });
  }

  // ---------------- G2/G4 prefabs and their market ----------------
  const pid = () => "p" + String(deps.randomId()).replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12).padEnd(8, "0");
  const idOk = (id) => /^p[a-z0-9]{6,14}$/.test(String(id || ""));
  const short = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
  const card = (id, p) => ({ id, n: p.n, k: p.k, lic: p.lic, price: p.price || 0, by: p.byName || short(p.w), byW: short(p.w), uses: p.uses || 0, sold: p.sold || 0, at: p.at, meta: p.meta, ...(p.orig ? { orig: { name: p.origName || "", id: p.origId || "" } } : {}) });
  async function pfSave(w, b) {
    const P = cleanPrefab({ ...(b.pf || {}), n: b.name, k: b.k }); if (!P) return json(400, { error: "a prefab needs a name and at least one piece" });
    if (JSON.stringify(P).length > PREFAB.BYTES) return json(400, { error: "that prefab is too big" });
    const lic = PF.LIC.includes(b.lic) ? b.lic : "cc-by", price = Math.floor(Number(b.price) || 0);
    if (price && !(price >= PREFAB.PRICE[0] && price <= PREFAB.PRICE[1])) return json(400, { error: `free, or a price from ${PREFAB.PRICE[0]} to ${PREFAB.PRICE[1].toLocaleString("en-US")} ARCL` });
    const mk = `worldStudioPrefabs/${w}`, dk = `worldStudioAiDay/pf_${w}_${day(now())}`, d0 = await getDocs([mk, dk]), mine = (d0[mk] || {}).ids || [];
    if (mine.length >= PREFAB.MINE) return json(400, { error: `you can keep ${PREFAB.MINE} prefabs — delete one first` });
    if (((d0[dk] || {}).n || 0) >= PREFAB.DAY) return json(429, { error: `${PREFAB.DAY} new prefabs a day` });
    // made from someone else's prefab: its licence decides — personal can't be shared again; the others credit it (and share a sale)
    let orig = null; if (b.from && idOk(b.from)) { const src = await one(`worldStudioPrefab/${b.from}`); if (src && src.w !== w) { if (src.lic === "personal") return json(403, { error: "that prefab's licence is personal — it can't be shared again" }); orig = { w: src.origW || src.w, name: src.origName || src.byName || short(src.w), id: src.origId || b.from }; } }
    const id = pid(), p = { w, byName: await (deps.nameOf ? deps.nameOf(w).catch(() => "") : ""), n: P.n, k: P.k, lic, price, pf: P, meta: P.meta, at: now(), uses: 0, sold: 0, ...(orig ? { origW: orig.w, origName: orig.name, origId: orig.id, orig: 1 } : {}) };
    await setDoc(`worldStudioPrefab/${id}`, p); await setDoc(mk, { ids: [id, ...mine] }); await setDoc(dk, { n: ((d0[dk] || {}).n || 0) + 1 });
    const ix = (await one("worldStudioPrefabIdx/all")) || {}; await setDoc("worldStudioPrefabIdx/all", { ids: [id, ...(ix.ids || []).filter((x) => x !== id)].slice(0, PREFAB.IDX) });
    return json(200, { ok: true, prefab: card(id, p) });
  }
  async function pfDel(w, b) { if (!idOk(b.id)) return json(400, { error: "no such prefab" }); const p = await one(`worldStudioPrefab/${b.id}`); if (!p || p.gone || (p.w !== w && !(deps.isGM && deps.isGM(w)))) return json(404, { error: "no such prefab" });
    await setDoc(`worldStudioPrefab/${b.id}`, { ...p, gone: true }); const mk = `worldStudioPrefabs/${p.w}`, m = (await one(mk)) || {}; await setDoc(mk, { ids: (m.ids || []).filter((x) => x !== b.id) });
    const ix = (await one("worldStudioPrefabIdx/all")) || {}; await setDoc("worldStudioPrefabIdx/all", { ids: (ix.ids || []).filter((x) => x !== b.id) }); return json(200, { ok: true }); } // (those who own it keep what they placed)
  async function pfGet(w, b) {
    if (!idOk(b.id)) return json(400, { error: "no such prefab" }); const p = await one(`worldStudioPrefab/${b.id}`); if (!p || p.gone) return json(404, { error: "no such prefab" });
    if (p.price > 0 && p.w !== w && !(await one(`worldStudioPfOwn/${w}_${b.id}`))) return json(402, { error: "buy it first", price: p.price });
    if (p.w !== w && deps.commit) { const r = await deps.commit([{ create: `worldStudioPfUse/${b.id}_${w}`, data: { at: now() } }]); if (r && r.ok) { await setDoc(`worldStudioPrefab/${b.id}`, { ...p, uses: (p.uses || 0) + 1 }); if (deps.notify) await deps.notify(p.w, { kind: "pfuse", t: p.n, by: await (deps.nameOf ? deps.nameOf(w).catch(() => "") : ""), id: b.id }).catch(() => {}); } } // (installed: counted once a wallet, the author told)
    return json(200, { ok: true, prefab: { ...card(b.id, p), pf: p.pf } });
  }
  async function pfBuy(w, b) {
    if (!idOk(b.id)) return json(400, { error: "no such prefab" }); const p = await one(`worldStudioPrefab/${b.id}`); if (!p || p.gone) return json(404, { error: "no such prefab" });
    if (!(p.price > 0)) return pfGet(w, b); if (p.w === w) return json(400, { error: "it's yours already" });
    if (Math.floor(Number(b.expectedPrice)) !== p.price) return json(409, { error: "the price changed", price: p.price });
    if (await one(`worldStudioPfOwn/${w}_${b.id}`)) return pfGet(w, b);
    if (!deps.pay) return json(503, { error: "the market is closed right now" });
    const r = await deps.pay(w, { id: "pf" + b.id, title: p.n, price: p.price, creator: p.w, kind: "prefab", orig: p.origW || "" }, `worldStudioPfOwn/${w}_${b.id}`); if (r.error) return json(r.bal != null ? 402 : 409, { error: r.error, price: p.price });
    await setDoc(`worldStudioPrefab/${b.id}`, { ...p, sold: (p.sold || 0) + 1 }); if (deps.notify) await deps.notify(p.w, { kind: "sale", t: p.n, by: await (deps.nameOf ? deps.nameOf(w).catch(() => "") : ""), id: b.id }).catch(() => {});
    const g = await pfGet(w, b), j = g && g.body; return j && j.ok ? json(200, { ...j, bal: r.bal }) : g;
  }
  async function pfList(url) {
    const q = String(url.searchParams.get("q") || "").toLowerCase().slice(0, 40), k = url.searchParams.get("k"), by = String(url.searchParams.get("by") || "").toLowerCase(), wl = String(url.searchParams.get("wallet") || "").toLowerCase(), sort = url.searchParams.get("sort");
    const ids = /^0x[0-9a-f]{40}$/.test(by) ? ((await one(`worldStudioPrefabs/${by}`)) || {}).ids || [] : (((await one("worldStudioPrefabIdx/all")) || {}).ids || []).slice(0, 200);
    const d = ids.length ? await getDocs(ids.map((i) => `worldStudioPrefab/${i}`)) : {};
    let items = ids.map((i) => (d[`worldStudioPrefab/${i}`] && !d[`worldStudioPrefab/${i}`].gone ? card(i, d[`worldStudioPrefab/${i}`]) : null)).filter(Boolean).filter((c) => (!k || c.k === k) && (!q || c.n.toLowerCase().includes(q) || String(c.by).toLowerCase().includes(q)));
    if (sort === "top") items.sort((a, b) => b.uses + b.sold * 3 - (a.uses + a.sold * 3) || b.at - a.at);
    let owned = []; if (/^0x[0-9a-f]{40}$/.test(wl)) { const paid = items.filter((c) => c.price > 0).slice(0, 60), od = paid.length ? await getDocs(paid.map((c) => `worldStudioPfOwn/${wl}_${c.id}`)) : {}; owned = paid.filter((c) => od[`worldStudioPfOwn/${wl}_${c.id}`]).map((c) => c.id); }
    return json(200, { ok: true, items: items.slice(0, 120), owned, lic: PF.LIC, cut: 0.8 }, /^0x/.test(wl) ? "no-store" : "public, max-age=20, s-maxage=30");
  }
  // ---------------- G4 premium templates: a game's licence and remix fee ----------------
  async function gameLic(w, b) {
    const id = String(b.id || ""); if (!/^g[a-z0-9]{2,12}$/.test(id)) return json(400, { error: "no such game" }); const g = await one(`worldStudio/${id}`); if (!g || g.gone || g.w !== w) return json(404, { error: "not your game" });
    const lic = PF.LIC.includes(b.lic) ? b.lic : "cc-by", fee = lic === "personal" ? 0 : Math.max(0, Math.min(PREFAB.FEE[1], Math.floor(Number(b.fee) || 0)));
    if (fee && fee < PREFAB.PRICE[0]) return json(400, { error: `a remix fee from ${PREFAB.PRICE[0]} ARCL, or free` });
    await setDoc(`worldStudio/${id}`, { ...g, lic, rfee: fee }); return json(200, { ok: true, lic, rfee: fee });
  }
  /// api/_world-studio.mjs asks before a remix is saved: null = fine, else { status, error, fee }
  async function remixGate(w, id, src) {
    if (!src || src.w === w) return null;
    if (src.lic === "personal") return { status: 403, error: "this game's creator doesn't allow remixes" };
    if (src.rfee > 0 && !(await one(`worldStudioRxOwn/${w}_${id}`))) return { status: 402, error: `remixing this premium template costs ${src.rfee} ARCL`, fee: src.rfee };
    return null;
  }
  async function remixBuy(w, b) {
    const id = String(b.id || ""); if (!/^g[a-z0-9]{2,12}$/.test(id)) return json(400, { error: "no such game" }); const g = await one(`worldStudio/${id}`); if (!g || g.gone || !g.pub) return json(404, { error: "no such game" });
    if (g.w === w || !(g.rfee > 0)) return json(200, { ok: true, free: true }); if (g.lic === "personal") return json(403, { error: "this game's creator doesn't allow remixes" });
    if (Math.floor(Number(b.expectedPrice)) !== g.rfee) return json(409, { error: "the price changed", price: g.rfee });
    if (await one(`worldStudioRxOwn/${w}_${id}`)) return json(200, { ok: true, owned: true });
    if (!deps.pay) return json(503, { error: "the market is closed right now" });
    const r = await deps.pay(w, { id: "rx" + id, title: g.spec.title, price: g.rfee, creator: g.w, kind: "template", orig: g.rootW && g.rootW !== g.w ? g.rootW : "" }, `worldStudioRxOwn/${w}_${id}`); if (r.error) return json(r.bal != null ? 402 : 409, { error: r.error, price: g.rfee });
    if (deps.notify) await deps.notify(g.w, { kind: "sale", t: g.spec.title, by: await (deps.nameOf ? deps.nameOf(w).catch(() => "") : ""), id }).catch(() => {});
    return json(200, { ok: true, bal: r.bal });
  }
  // ---------------- G3 saves: a player's progress in a course that keeps it ----------------
  const clean = (d) => { const n = (v, a, z) => Math.max(a, Math.min(z, Math.round(Number(v) || 0))), ix = (l) => (Array.isArray(l) ? l.slice(0, OB.CAP.Q).map((x) => n(x, 0, OB.MAX)) : []);
    return { cp: n(d.cp, 0, OB.MAX), n: n(d.n, 0, 30), c: n(d.c, 0, 99999), A: n(d.A, 0, 999), Bv: n(d.Bv, 0, 999), dj: d.dj ? 1 : 0, sk: Math.min(1.25, Math.max(1, Number(d.sk) || 1)), sh: d.sh ? 1 : 0, h: n(d.h, 0, 5), q: ix(d.q), e: ix(d.e), lap: n(d.lap, 0, 5), ri: n(d.ri, 0, 30), at: now() }; };
  async function prog(w, b) { const id = String(b.id || ""); if (!/^g[a-z0-9]{2,12}$/.test(id)) return json(400, { error: "no such game" }); const k = `worldStudioProg/${id}_${w}`;
    if (b.clear) { await setDoc(k, { gone: 1, at: now() }); return json(200, { ok: true }); } await setDoc(k, clean(b.d || {})); return json(200, { ok: true }); }

  // ---------------- the remix tree ----------------
  /// a remix is saved: the parent lists it, the parent's maker hears of it
  async function remixed(kid, g) {
    if (!g.from || !g.from.id) return; const k = `worldStudioRemix/${g.from.id}`, d = (await one(k)) || {};
    await setDoc(k, { ids: [{ id: kid, title: g.spec.title, byName: g.byName || "", at: now() }, ...(d.ids || []).filter((x) => x.id !== kid)].slice(0, REMIX.KIDS) });
    if (g.fromW && g.fromW !== g.w && deps.notify) await deps.notify(g.fromW, { kind: "remix", t: g.from.title || "", by: g.byName || "", id: kid }).catch(() => {});
  }
  /// a counted play of a remix: the original (the root) and the parent get it in their remix plays; the root's maker's
  /// all-time count (worldStudioOrigin) is what a creator's share of future earnings from remixes would be read from
  async function remixPlay(id, g) {
    if (!g.from || !g.from.id) return; const root = (g.root && g.root.id) || g.from.id, ks = [`worldStudioRx/${root}`, ...(g.from.id !== root ? [`worldStudioRx/${g.from.id}`] : []), ...(g.rootW ? [`worldStudioOrigin/${g.rootW}`] : [])], d = await getDocs(ks);
    for (const k of ks) { const x = d[k] || {}; if (k.startsWith("worldStudioOrigin/")) await setDoc(k, { plays: (x.plays || 0) + 1, at: now() }); else { const by = { ...(x.by || {}) }; by[id] = (by[id] || 0) + 1; await setDoc(k, { plays: (x.plays || 0) + 1, by: Object.fromEntries(Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, REMIX.KIDS)) }); } }
  }
  async function tree(id) {
    if (!/^g[a-z0-9]{2,12}$/.test(String(id))) return json(400, { error: "no such game" });
    const chain = []; let cur = await one(`worldStudio/${id}`); if (!cur || cur.gone) return json(404, { error: "no such game" });
    const seen = new Set([id]); while (cur && cur.from && cur.from.id && chain.length < REMIX.CHAIN && !seen.has(cur.from.id)) { seen.add(cur.from.id); chain.push({ id: cur.from.id, title: cur.from.title || "", byName: cur.from.byName || "" }); cur = await one(`worldStudio/${cur.from.id}`); }
    const d = await getDocs([`worldStudioRemix/${id}`, `worldStudioRx/${id}`]), rx = d[`worldStudioRx/${id}`] || {};
    return json(200, { ok: true, chain, kids: ((d[`worldStudioRemix/${id}`] || {}).ids || []).map((k) => ({ ...k, plays: (rx.by || {})[k.id] || 0 })), rx: rx.plays || 0 }, "public, max-age=30, s-maxage=60");
  }

  return {
    remixed, remixPlay, remixGate,
    async read(url) {
      const w = url.searchParams.get("world");
      if (w === "studio-remixes") return tree(url.searchParams.get("id"));
      if (w === "studio-prefabs") return pfList(url);
      if (w === "studio-prog" || w === "studio-remix-ok") { const a = String(url.searchParams.get("wallet") || "").toLowerCase(), id = String(url.searchParams.get("id") || ""); if (!/^0x[0-9a-f]{40}$/.test(a) || !/^g[a-z0-9]{2,12}$/.test(id)) return json(400, { error: "wallet and id" });
        if (w === "studio-prog") { const d = await one(`worldStudioProg/${id}_${a}`); return json(200, { ok: true, d: d && !d.gone ? d : null }, "no-store"); }
        const g = await one(`worldStudio/${id}`); if (!g) return json(404, { error: "no such game" }); const own = g.w === a || !(g.rfee > 0) || !!(await one(`worldStudioRxOwn/${a}_${id}`)); return json(200, { ok: g.lic !== "personal" && own, fee: g.rfee || 0, lic: g.lic || "cc-by" }, "no-store"); }
      if (w === "studio-asset-glb") return glb(url.searchParams.get("id"));
      if (w === "studio-assets") { const a = String(url.searchParams.get("wallet") || "").toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(a)) return json(400, { error: "wallet must be an address" });
        const ids = ((await one(`worldStudioAssets/${a}`)) || {}).ids || [], d = ids.length ? await getDocs(ids.map((i) => `worldStudioAsset/${i}`)) : {};
        return json(200, { ok: true, open: open(), day: ASSET.DAY, assets: ids.map((i) => (d[`worldStudioAsset/${i}`] ? pubA(i, d[`worldStudioAsset/${i}`]) : null)).filter(Boolean) }); }
      return null;
    },
    async handle(b) {
      const a = String(b.action || ""); if (!["world-studio-obby-ai", "world-studio-asset-make", "world-studio-asset-poll", "world-studio-prefab-save", "world-studio-prefab-del", "world-studio-prefab-get", "world-studio-prefab-buy", "world-studio-game-lic", "world-studio-remix-buy", "world-studio-prog"].includes(a)) return null;
      const s = signer(b); if (s.err) return s.err; const w = s.wallet;
      if (deps.shut && deps.shut(w)) return json(403, { error: "ARCIRCLE Studio is under construction", closed: true });
      if (a === "world-studio-obby-ai") return director(w, b);
      if (a === "world-studio-asset-make") return make(w, b);
      if (a === "world-studio-prefab-save") return pfSave(w, b); if (a === "world-studio-prefab-del") return pfDel(w, b); if (a === "world-studio-prefab-get") return pfGet(w, b); if (a === "world-studio-prefab-buy") return pfBuy(w, b);
      if (a === "world-studio-game-lic") return gameLic(w, b); if (a === "world-studio-remix-buy") return remixBuy(w, b); if (a === "world-studio-prog") return prog(w, b);
      return poll(w, b);
    },
    _cleanObby: cleanObby,
  };
}
