// api/_world-hub.mjs — the Creator Hub's own server (2026-10-28, the owner: "다 진행하자" — the hub's next step after the
// Roblox-style front page): creator profiles, a forum, an inbox of notifications, patch notes, a market of shared
// pieces, sponsor contests and a creator's titles from ARCIRCLE WORLD. Games themselves stay in api/_world-studio.mjs;
// it calls notify() here when something happens to a creator (a comment, a follow, a beaten record, a teammate).
// Nothing here pays or holds ARCL or USDC; a sponsor contest's prize is the GM's text, paid the way the weekly contest is.
//
//   GET  ?world=hub-inbox&wallet=0x…          → { items: [{ k, kind, t, by, id, at }], seen }
//   POST { action: "world-hub-seen", …signature }                    → { seen }
//   GET  ?world=hub-profile&h=…               → { profile: { bio, banner, pins, links, team }, world: { lv, titles, rookie } }
//   POST { action: "world-hub-profile", …signature, bio, banner, pins, links } → { profile }
//   GET  ?world=hub-board&b=show|help|bugs|team → { posts: [{ id, title, name, at, n, likes, game? }] }
//   GET  ?world=hub-post&id=…                 → { post, replies }
//   POST { action: "world-hub-post",  …signature, b, title, t, game? } → { id }
//   POST { action: "world-hub-reply", …signature, id, t }            → { replies }
//   POST { action: "world-hub-like",  …signature, id }               → { likes }   (once a wallet)
//   POST { action: "world-hub-del",   …signature, id, k? }           → { ok }      (its writer or a GM)
//   POST { action: "world-hub-note",  …signature, id, t }            → { notes }   (a patch note on your game; your followers see it)
//   GET  ?world=hub-notes&id=…                → { notes }
//   GET  ?world=hub-pieces                    → { list: [{ id, name, by, tpl, w, h, uses, at }] }
//   GET  ?world=hub-piece&id=…                → { piece: { …, cells } }
//   POST { action: "world-hub-piece", …signature, name, piece }      → { id }      (share a Jump World piece)
//   POST { action: "world-hub-piece-use", …signature, id }           → { uses }    (once a wallet)
//   GET  ?world=hub-sponsors                  → { list: [{ id, title, partner, prize, tpl, ends, url }] }
//   POST { action: "world-hub-sponsor", …signature, id?, title, partner, prize, tpl, ends, url, off? } → { list } (a GM)
// Firestore: worldHubInbox/<w> { list, seen } · worldHubProfile/<w> · worldHubBoard/<b> { list } · worldHubPost/<id> { …, replies }
//            worldHubLike/<id>_<w> (create-only) · worldHubBy/<w> { at } (the gap between posts) · worldStudioNotes/<gameId> { list }
//            worldHubPieces { list } · worldHubPiece/<id> · worldHubPieceUse/<id>_<w> (create-only) · worldHubSponsors { list }
export const HUB = {
  INBOX: 60, BIO: 160, LINKS: 3, PINS: 3, BANNERS: 6,
  BOARDS: ["show", "help", "bugs", "team"], TITLE: 80, POST: 1200, REPLY: 400, REPLIES: 100, BOARD_KEEP: 120, GAP: 30e3,
  NOTE: 280, NOTES: 20, PIECES: 200, PIECE_W: 16, PIECE_H: 10, PIECE_BYTES: 4000, SPONSORS: 6,
};
const W_RE = /^0x[0-9a-f]{40}$/, G_RE = /^g[a-z0-9]{2,12}$/, P_RE = /^p[a-z0-9]{4,12}$/;

/// deps: { getDocs, setDoc, commit, json, now, signer(b), isGM(w), nameOf(w), saveOf(w), randomId(), levelOfSave(sv) }
export function makeHub(deps) {
  const { getDocs, setDoc, json, signer } = deps;
  const now = () => deps.now(), one = async (p) => (await getDocs([p]))[p];
  const clean = (t, n) => String(t || "").replace(/[\u0000-\u0008\u000b-\u001f<>]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
  const line = (t, n) => clean(t, n).replace(/\s+/g, " ");
  const rid = (p) => p + String(deps.randomId()).replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 10).padEnd(6, "x");
  const nameFor = async (w) => line(await deps.nameOf(w).catch(() => ""), 20) || "Creator " + String(w || "").slice(2, 6).toUpperCase();
  const tag = (w) => String(w || "").slice(2, 8);
  const gm = (w) => !!(deps.isGM && deps.isGM(w));

  // ---------------- the inbox ----------------
  /// a notification for a creator: kinds cmt (a comment on your game), fan (a new follower), beat (your record beaten),
  /// team (someone joined your build), reply (a reply to your post), use (your piece used), note (a creator you follow
  /// wrote a patch note) — kept the newest INBOX, the same kind about the same thing from the same person folded into one
  async function notify(w, it) {
    if (!W_RE.test(String(w || "")) || !it || !it.kind) return;
    const k = `worldHubInbox/${w}`, d = (await one(k)) || {}, at = now();
    const item = { k: rid("n"), kind: String(it.kind), t: line(it.t, 120), by: line(it.by, 20), id: String(it.id || "").slice(0, 16), at };
    const list = [item, ...(d.list || []).filter((x) => !(x.kind === item.kind && x.id === item.id && x.by === item.by && at - x.at < 3600e3))].slice(0, HUB.INBOX);
    await setDoc(k, { list, seen: d.seen || 0 });
  }
  async function seen(w) { const k = `worldHubInbox/${w}`, d = (await one(k)) || {}; await setDoc(k, { list: d.list || [], seen: now() }); return json(200, { ok: true, seen: now() }); }

  // ---------------- profiles ----------------
  const walletOfHandle = async (h) => { h = String(h || "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20); if (!h) return ""; const d = await one(`worldStudioHandle/${h}`); return d && d.w ? d.w : ""; };
  const profOut = (p) => ({ bio: p.bio || "", banner: p.banner || 0, pins: p.pins || [], links: p.links || [], ...(p.at ? { at: p.at } : {}) });
  async function setProfile(w, b) {
    const banner = Math.max(0, Math.min(HUB.BANNERS - 1, Math.floor(Number(b.banner) || 0)));
    const pins = [...new Set((Array.isArray(b.pins) ? b.pins : []).map(String).filter((i) => G_RE.test(i)))].slice(0, HUB.PINS), mine = [];
    if (pins.length) { const docs = await getDocs(pins.map((i) => `worldStudio/${i}`)); for (const i of pins) { const g = docs[`worldStudio/${i}`]; if (g && !g.gone && g.pub && g.w === w) mine.push(i); } }
    const links = (Array.isArray(b.links) ? b.links : []).map((u) => String(u || "").trim()).filter((u) => /^https:\/\/(x\.com|twitter\.com|t\.me|discord\.gg|youtube\.com|www\.youtube\.com|github\.com)\/[\w./?=&%-]{1,120}$/.test(u)).slice(0, HUB.LINKS);
    const p = { bio: clean(b.bio, HUB.BIO), banner, pins: mine, links, at: now() };
    await setDoc(`worldHubProfile/${w}`, p); return json(200, { ok: true, profile: profOut(p) });
  }
  /// a creator's titles from ARCIRCLE WORLD: the save's level, the achievements' titles they hold (ids), the Rookie Creator
  async function worldOf(w) {
    const sv = deps.saveOf ? await deps.saveOf(w).catch(() => null) : null; if (!sv) return null;
    const ach = (((sv.rpg || {}).x || {}).ach || []).filter((x) => typeof x === "string").slice(0, 80);
    return { lv: deps.levelOfSave ? deps.levelOfSave(sv) : 1, ach, rookie: ach.includes("cctut") };
  }
  async function profile(h) {
    const w = await walletOfHandle(h); if (!w) return json(404, { error: "no such creator" });
    const [p, world, team] = [(await one(`worldHubProfile/${w}`)) || {}, await worldOf(w), ((await one(`worldStudioCoBy/${w}`)) || {}).ids || []];
    return json(200, { ok: true, profile: { ...profOut(p), team: team.length }, world }, "public, max-age=30");
  }

  // ---------------- the forum ----------------
  const postCard = (id, p) => ({ id, b: p.b, title: p.title, name: p.name, by: tag(p.w), at: p.at, up: p.up || p.at, n: (p.replies || []).length, likes: p.likes || 0, ...(p.game ? { game: p.game } : {}), ...(p.gm ? { gm: true } : {}) });
  async function boardSet(b, id, p) {
    const k = `worldHubBoard/${b}`, d = (await one(k)) || {}, list = (d.list || []).filter((x) => x.id !== id);
    if (p) list.unshift(postCard(id, p)); await setDoc(k, { list: list.sort((x, y) => (y.up || y.at) - (x.up || x.at)).slice(0, HUB.BOARD_KEEP) });
  }
  async function gap(w) { const d = (await one(`worldHubBy/${w}`)) || {}; if (now() - (d.at || 0) < HUB.GAP) return false; await setDoc(`worldHubBy/${w}`, { at: now() }); return true; }
  async function post(w, b) {
    const board = String(b.b || ""); if (!HUB.BOARDS.includes(board)) return json(400, { error: "pick a board" });
    const title = line(b.title, HUB.TITLE), t = clean(b.t, HUB.POST); if (title.length < 3) return json(400, { error: "give it a title" }); if (t.length < 5) return json(400, { error: "write a little more" });
    let game = ""; if (G_RE.test(String(b.game || ""))) { const g = await one(`worldStudio/${b.game}`); if (g && g.pub && !g.gone && !g.hidden) game = b.game; }
    if (!(await gap(w))) return json(429, { error: "a moment before the next post" });
    const id = rid("t"), p = { b: board, w, name: await nameFor(w), title, t, at: now(), up: now(), likes: 0, replies: [], ...(game ? { game } : {}), ...(gm(w) ? { gm: true } : {}) };
    await setDoc(`worldHubPost/${id}`, p); await boardSet(board, id, p); return json(200, { ok: true, id });
  }
  const repOut = (r) => ({ k: r.k, name: r.name, by: tag(r.w), t: r.t, at: r.at, ...(r.gm ? { gm: true } : {}), ...(r.op ? { op: true } : {}) });
  async function reply(w, b) {
    const id = String(b.id || ""), p = /^t[a-z0-9]{5,12}$/.test(id) ? await one(`worldHubPost/${id}`) : null; if (!p || p.gone) return json(404, { error: "no such post" });
    const t = clean(b.t, HUB.REPLY); if (t.length < 2) return json(400, { error: "write a little more" });
    if ((p.replies || []).length >= HUB.REPLIES) return json(400, { error: "this thread is full — start a new one" });
    if (!(await gap(w))) return json(429, { error: "a moment before the next reply" });
    const name = await nameFor(w), r = { k: rid("r"), w, name, t, at: now(), ...(gm(w) ? { gm: true } : {}), ...(w === p.w ? { op: true } : {}) };
    p.replies = [...(p.replies || []), r]; p.up = now(); await setDoc(`worldHubPost/${id}`, p); await boardSet(p.b, id, p);
    if (p.w !== w) await notify(p.w, { kind: "reply", t: p.title, by: name, id });
    return json(200, { ok: true, replies: p.replies.map(repOut) });
  }
  async function like(w, b) {
    const id = String(b.id || ""), p = /^t[a-z0-9]{5,12}$/.test(id) ? await one(`worldHubPost/${id}`) : null; if (!p || p.gone) return json(404, { error: "no such post" });
    if (!(await deps.commit([{ create: `worldHubLike/${id}_${w}`, data: { at: now() } }])).ok) return json(200, { ok: true, likes: p.likes || 0, already: true });
    p.likes = (p.likes || 0) + 1; await setDoc(`worldHubPost/${id}`, p); await boardSet(p.b, id, p); return json(200, { ok: true, likes: p.likes });
  }
  async function del(w, b) {
    const id = String(b.id || ""), p = /^t[a-z0-9]{5,12}$/.test(id) ? await one(`worldHubPost/${id}`) : null; if (!p || p.gone) return json(404, { error: "no such post" });
    if (b.k) { const r = (p.replies || []).find((x) => x.k === String(b.k)); if (!r) return json(404, { error: "no such reply" }); if (r.w !== w && !gm(w)) return json(403, { error: "only its writer or a GM" });
      p.replies = p.replies.filter((x) => x !== r); await setDoc(`worldHubPost/${id}`, p); await boardSet(p.b, id, p); return json(200, { ok: true, replies: p.replies.map(repOut) }); }
    if (p.w !== w && !gm(w)) return json(403, { error: "only its writer or a GM" });
    await setDoc(`worldHubPost/${id}`, { gone: true, w: p.w, b: p.b }); await boardSet(p.b, id, null); return json(200, { ok: true });
  }

  // ---------------- patch notes ----------------
  async function note(w, b) {
    const id = String(b.id || ""), g = G_RE.test(id) ? await one(`worldStudio/${id}`) : null; if (!g || g.gone || (g.w !== w && !(g.co || []).includes(w))) return json(404, { error: "not your game" });
    const t = clean(b.t, HUB.NOTE); if (t.length < 3) return json(400, { error: "write a little more" });
    const k = `worldStudioNotes/${id}`, d = (await one(k)) || {}, name = await nameFor(w), list = [{ k: rid("v"), t, name, at: now() }, ...(d.list || [])].slice(0, HUB.NOTES);
    await setDoc(k, { list });
    if (g.pub && !g.hidden && g.w === w) { // (the followers' feed carries the note with the game)
      const fk = `worldStudioFeedOf/${w}`, f = (await one(fk)) || {}, rest = (f.list || []).filter((x) => x.id !== id);
      await setDoc(fk, { list: [{ id, title: g.spec.title, tpl: g.spec.tpl, theme: g.spec.theme, byName: g.byName || "", at: now(), note: t.slice(0, 120) }, ...rest].slice(0, 10) });
    }
    return json(200, { ok: true, notes: list });
  }

  // ---------------- shared pieces (Jump World) ----------------
  /// a piece is a small grid of the Jump World builder's cells: [[x, y, kind]] inside PIECE_W × PIECE_H, kinds the builder's
  /// own one-letter codes; the server only checks its size and shape — the builder cleans what it places, as always
  function pieceOf(p) {
    if (!p || !Array.isArray(p.cells)) return null; if (JSON.stringify(p).length > HUB.PIECE_BYTES) return null;
    const cells = []; for (const c of p.cells) { if (!Array.isArray(c) || (c.length !== 3 && c.length !== 4)) return null; const [x, y, k, d] = c; if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= HUB.PIECE_W || y >= HUB.PIECE_H || typeof k !== "string" || !/^[a-zA-Z0-9]{1,2}$/.test(k)) return null; cells.push(d === 1 ? [x, y, k, 1] : [x, y, k]); }
    if (cells.length < 2) return null; const w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1; return { cells, w, h };
  }
  async function sharePiece(w, b) {
    const name = line(b.name, 30), pc = pieceOf(b.piece); if (name.length < 2) return json(400, { error: "give it a name" }); if (!pc) return json(400, { error: "that piece is too big or broken" });
    if (!(await gap(w))) return json(429, { error: "a moment before the next share" });
    const id = rid("p"), by = await nameFor(w), doc = { name, by, ...pc, own: w, tpl: "jump", uses: 0, at: now() }; // (own: the maker — w is the width)
    await setDoc(`worldHubPiece/${id}`, doc);
    const d = (await one("worldHub/pieces")) || {}; await setDoc("worldHub/pieces", { list: [{ id, name, by, w: pc.w, h: pc.h, tpl: "jump", uses: 0, at: doc.at }, ...(d.list || [])].slice(0, HUB.PIECES) });
    return json(200, { ok: true, id });
  }
  async function usePiece(w, b) {
    const id = String(b.id || ""), p = P_RE.test(id) ? await one(`worldHubPiece/${id}`) : null; if (!p) return json(404, { error: "no such piece" });
    if (p.own === w || !(await deps.commit([{ create: `worldHubPieceUse/${id}_${w}`, data: { at: now() } }])).ok) return json(200, { ok: true, uses: p.uses || 0 });
    p.uses = (p.uses || 0) + 1; await setDoc(`worldHubPiece/${id}`, p);
    const d = (await one("worldHub/pieces")) || {}; await setDoc("worldHub/pieces", { list: (d.list || []).map((x) => (x.id === id ? { ...x, uses: p.uses } : x)) });
    await notify(p.own, { kind: "use", t: p.name, by: await nameFor(w), id }); return json(200, { ok: true, uses: p.uses });
  }

  // ---------------- sponsor contests (set by a GM) ----------------
  async function sponsor(w, b) {
    if (!gm(w)) return json(403, { error: "GM only" });
    const d = (await one("worldHub/sponsors")) || {}; let list = d.list || [];
    const id = /^s[a-z0-9]{4,12}$/.test(String(b.id || "")) ? b.id : rid("s");
    if (b.off) list = list.filter((x) => x.id !== id);
    else { const ends = Number(b.ends) || 0; if (ends < now()) return json(400, { error: "the end must be in the future" });
      const url = /^https:\/\/[\w.-]+\/[\w./?=&%-]{0,120}$/.test(String(b.url || "")) ? b.url : "";
      const tpl = String(b.tpl || "").replace(/[^a-z]/g, "").slice(0, 12);
      const s = { id, title: line(b.title, 60), partner: line(b.partner, 30), prize: line(b.prize, 60), tpl, ends, url, at: now() }; if (s.title.length < 3) return json(400, { error: "give it a title" });
      list = [s, ...list.filter((x) => x.id !== id)].slice(0, HUB.SPONSORS); }
    await setDoc("worldHub/sponsors", { list }); return json(200, { ok: true, list });
  }

  return {
    notify,
    async read(url) {
      const w = url.searchParams.get("world");
      if (w === "hub-inbox") { const a = String(url.searchParams.get("wallet") || "").toLowerCase(); if (!W_RE.test(a)) return json(400, { error: "wallet must be an address" }); const d = (await one(`worldHubInbox/${a}`)) || {}; return json(200, { ok: true, items: d.list || [], seen: d.seen || 0, ...(gm(a) ? { gm: true } : {}) }); }
      if (w === "hub-profile") return profile(url.searchParams.get("h"));
      if (w === "hub-board") { const b = String(url.searchParams.get("b") || ""); if (!HUB.BOARDS.includes(b)) return json(400, { error: "no such board" }); const d = (await one(`worldHubBoard/${b}`)) || {}; return json(200, { ok: true, posts: d.list || [] }, "public, max-age=10"); }
      if (w === "hub-post") { const id = String(url.searchParams.get("id") || ""), p = /^t[a-z0-9]{5,12}$/.test(id) ? await one(`worldHubPost/${id}`) : null; if (!p || p.gone) return json(404, { error: "no such post" }); return json(200, { ok: true, post: { ...postCard(id, p), t: p.t }, replies: (p.replies || []).map(repOut) }); }
      if (w === "hub-notes") { const id = String(url.searchParams.get("id") || ""); if (!G_RE.test(id)) return json(400, { error: "id" }); const d = (await one(`worldStudioNotes/${id}`)) || {}; return json(200, { ok: true, notes: d.list || [] }, "public, max-age=30"); }
      if (w === "hub-pieces") { const d = (await one("worldHub/pieces")) || {}; return json(200, { ok: true, list: d.list || [] }, "public, max-age=30"); }
      if (w === "hub-piece") { const id = String(url.searchParams.get("id") || ""), p = P_RE.test(id) ? await one(`worldHubPiece/${id}`) : null; if (!p) return json(404, { error: "no such piece" }); return json(200, { ok: true, piece: { id, name: p.name, by: p.by, tpl: p.tpl, w: p.w, h: p.h, cells: p.cells, uses: p.uses || 0 } }); }
      if (w === "hub-sponsors") { const d = (await one("worldHub/sponsors")) || {}; return json(200, { ok: true, list: (d.list || []).filter((s) => s.ends > now()) }, "public, max-age=60"); }
      return null;
    },
    async handle(b) {
      if (!String(b.action || "").startsWith("world-hub-")) return null;
      const s = signer(b); if (s.err) return s.err; const w = s.wallet;
      if (b.action === "world-hub-seen") return seen(w);
      if (b.action === "world-hub-profile") return setProfile(w, b);
      if (b.action === "world-hub-post") return post(w, b);
      if (b.action === "world-hub-reply") return reply(w, b);
      if (b.action === "world-hub-like") return like(w, b);
      if (b.action === "world-hub-del") return del(w, b);
      if (b.action === "world-hub-note") return note(w, b);
      if (b.action === "world-hub-piece") return sharePiece(w, b);
      if (b.action === "world-hub-piece-use") return usePiece(w, b);
      if (b.action === "world-hub-sponsor") return sponsor(w, b);
      return json(400, { error: "unknown hub action" });
    },
  };
}
