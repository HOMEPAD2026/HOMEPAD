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
import { clampSpec, genObbyBuild, obWants, obTweak, cleanObby, OB } from "./_world-studio-gen.mjs";

export const ASSET = { DAY: 2, ALL_DAY: 40, MAX: 20, POLYS: 5000, NAME: 40, MESHY: "https://api.meshy.ai/openapi/v2/text-to-3d", GLB_MAX: 4.4e6 };
export const REMIX = { KIDS: 60, CHAIN: 6 };

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
    let wants = null, phrases = null, by = "rules";
    if ((d.n || 0) < (deps.AI_DAY || 10)) {
      const sys = tweak ? `You edit a 3D obstacle course ("obby") in ARCIRCLE Studio. Reply with JSON only: {"do": a list of short English change phrases from this set — "add a boss", "harder ending", "easier", "more coins", "add a shop", "add checkpoints", "add spinners", "add a timer", "night look", "sunset look", "mist look", "space look", "toon look", "cinematic look", "day look"}.`
        : `You design a 3D obstacle course ("obby") in ARCIRCLE Studio from the player's words. Reply with JSON only: {"boss": bool, "shop": bool, "doors": bool, "elevator": bool, "bp": bool (a flat baseplate), "timer": seconds 0-600, "look": one of ${OB.LOOKS.join("|")}, "theme": one of neon|jungle|ice|lava|candy, "secs": 3-12 (sections), "hard": -1|0|1, "title": up to 24 characters}.`;
      try { const r = deps.ai ? await deps.ai(sys, [{ role: "user", content: t }]) : null, m = r && String(r).match(/\{[\s\S]*\}/); if (m) { const j = JSON.parse(m[0]); if (tweak) phrases = (Array.isArray(j.do) ? j.do : []).map((x) => line(x, 40)).slice(0, 6); else wants = j; by = "agent"; } } catch { wants = phrases = null; }
      if (by === "agent") await setDoc(k, { n: (d.n || 0) + 1 });
    }
    if (tweak) { const sp = clampSpec({ ...spec, build: b.build }), r = obTweak(sp, phrases && phrases.length ? phrases.join(", ") : t); return json(200, { ok: true, build: r.build, did: r.did, by }); }
    const rw = obWants(t), W = { ...rw, ...(wants ? { boss: !!wants.boss, shop: !!wants.shop, doors: !!wants.doors, elevator: !!wants.elevator, bp: !!wants.bp, timer: Math.max(0, Math.min(600, Math.round(Number(wants.timer) || 0))), look: OB.LOOKS.includes(wants.look) ? wants.look : rw.look, secs: Math.max(3, Math.min(12, Math.round(Number(wants.secs) || 0))) || rw.secs, hard: [-1, 0, 1].includes(wants.hard) ? wants.hard : rw.hard, theme: ["neon", "jungle", "ice", "lava", "candy"].includes(wants.theme) ? wants.theme : rw.theme } : {}) };
    const sp = clampSpec({ ...spec, ...(W.theme ? { theme: W.theme } : {}), speed: Math.max(1, Math.min(5, spec.speed + W.hard)), walls: Math.max(0, Math.min(5, spec.walls + W.hard)), seed: 1 + Math.floor((deps.random || Math.random)() * 99999), ...(wants && wants.title ? { title: line(wants.title, 24) } : {}) });
    return json(200, { ok: true, build: genObbyBuild(sp, W), spec: { ...sp, build: undefined }, by });
  }

  // ---------------- the creators' own Meshy assets ----------------
  const aid = () => "a" + String(deps.randomId()).replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12).padEnd(8, "0");
  const pubA = (id, a) => ({ id, name: a.name, ready: a.st === "done", failed: a.st === "fail", at: a.at });
  async function make(w, b) {
    if (!open()) return json(503, { error: "making assets with Meshy opens soon" });
    const t = line(b.t, ASSET.NAME * 3); if (t.length < 3) return json(400, { error: "describe the prop in a few words" });
    const dk = `worldStudioAssetDay/${w}_${day(now())}`, gk = `worldStudioAssetDay/all_${day(now())}`, d = await getDocs([dk, gk, `worldStudioAssets/${w}`]), mine = (d[`worldStudioAssets/${w}`] || {}).ids || [];
    if (((d[dk] || {}).n || 0) >= ASSET.DAY) return json(429, { error: `${ASSET.DAY} new assets a day — back tomorrow` });
    if (((d[gk] || {}).n || 0) >= ASSET.ALL_DAY) return json(429, { error: "today's Meshy budget is used up — back tomorrow" });
    if (mine.length >= ASSET.MAX) return json(400, { error: `you can keep ${ASSET.MAX} assets` });
    const r = await meshy("POST", ASSET.MESHY, { mode: "preview", prompt: `${t}, a single game prop, clean stylized shape, centered`, art_style: "realistic", should_remesh: true, topology: "triangle", target_polycount: ASSET.POLYS });
    const task = r && r.ok && r.j && (r.j.result || r.j.id); if (!task) return json(502, { error: "Meshy didn't take it — try again later" });
    const id = aid(), a = { w, name: line(t, ASSET.NAME), at: now(), st: "shape", pre: String(task) };
    await setDoc(`worldStudioAsset/${id}`, a); await setDoc(`worldStudioAssets/${w}`, { ids: [id, ...mine].slice(0, ASSET.MAX) });
    await setDoc(dk, { n: ((d[dk] || {}).n || 0) + 1 }); await setDoc(gk, { n: ((d[gk] || {}).n || 0) + 1 });
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
    remixed, remixPlay,
    async read(url) {
      const w = url.searchParams.get("world");
      if (w === "studio-remixes") return tree(url.searchParams.get("id"));
      if (w === "studio-asset-glb") return glb(url.searchParams.get("id"));
      if (w === "studio-assets") { const a = String(url.searchParams.get("wallet") || "").toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(a)) return json(400, { error: "wallet must be an address" });
        const ids = ((await one(`worldStudioAssets/${a}`)) || {}).ids || [], d = ids.length ? await getDocs(ids.map((i) => `worldStudioAsset/${i}`)) : {};
        return json(200, { ok: true, open: open(), day: ASSET.DAY, assets: ids.map((i) => (d[`worldStudioAsset/${i}`] ? pubA(i, d[`worldStudioAsset/${i}`]) : null)).filter(Boolean) }); }
      return null;
    },
    async handle(b) {
      const a = String(b.action || ""); if (!["world-studio-obby-ai", "world-studio-asset-make", "world-studio-asset-poll"].includes(a)) return null;
      const s = signer(b); if (s.err) return s.err; const w = s.wallet;
      if (deps.shut && deps.shut(w)) return json(403, { error: "ARCIRCLE Studio is under construction", closed: true });
      if (a === "world-studio-obby-ai") return director(w, b);
      if (a === "world-studio-asset-make") return make(w, b);
      return poll(w, b);
    },
    _cleanObby: cleanObby,
  };
}
