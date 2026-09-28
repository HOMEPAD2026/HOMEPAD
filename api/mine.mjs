// api/mine.mjs — Builder Mine (arcpad.html#mine, arc-mine.js; the rules are in api/_mine.mjs).
//   GET  /api/mine?cfg=1                      the game's numbers, items, contract, what's switched on
//   GET  /api/mine?list=1                     every mine: token, deposit, layer, status
//   GET  /api/mine?id=<n>                     one mine: schedule, this hour, leaderboard, rare-find feed
//   GET  /api/mine?id=<n>&w=0x…               one builder: rig, bonuses, this hour, mined, claim proof
//   POST /api/mine?auth=1  {w, t, sig}         sign in (a personal_sign of signInMessage) → session token
//   GET  /api/mine?work=<n>&w=0x…&s=<token>   this hour's challenge for that wallet
//   POST /api/mine?shares=<n> {w, s, nonces}  hand in shares
//   POST /api/mine?xpost=<n>  {w, s, url}     prove an X post (unlocks claiming; more posts add bonus)
//   POST /api/mine?look=1     {w, s, char, pet} pick a character and a pet (unlocked by rank; looks only)
//   POST /api/mine?quests=1   {w, s}           claim today's finished quests (rank XP)
//   POST /api/mine?crew=create|join|leave {w, s, name}   crews
//   GET  /api/mine?boards=1                   this month's season, crews, the Arc Crystal hall of fame
//   GET  /api/mine?builder=0x…                a builder's card without a mine (rank, looks, quests, badges, ore book)
//   GET  /api/mine?stats=1                    across every mine: $ARCIRCLE burned (all time, today), digging now, hottest mine
//   GET  /api/mine?creator=<n>                a mine's dashboard: hourly history, posts, referrals, top-ups
//   POST /api/mine?prefs=1    {w, s, xshare}   let ARCIA post my Arc Crystal on X (tagging me)
//   GET  /api/mine?settle=1&key=<CRON_SECRET> settle finished hours and post roots (arcia-tg's tick does this too)
import * as M from "./_mine.mjs";
import { minePage, mineEmbed } from "./_mine-pages.mjs";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };
const json = (o, status = 200, cache = "no-store") => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": cache, ...CORS } });
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const idOk = (x) => /^\d{1,6}$/.test(String(x || ""));
const authed = (req, q) => { const s = process.env.CRON_SECRET; return !!s && (q.key === s || req.headers.get("authorization") === `Bearer ${s}`); };

export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function GET(req) {
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams);
  try {
    // the share page and the embed (vercel.json: /mine/:id and /embed/mine/:id)
    if (q.view === "page") { url.searchParams.set("id", q.page || q.id || ""); return await minePage(url); }
    if (q.view === "embed") { url.searchParams.set("id", q.embed || q.id || ""); return await mineEmbed(url); }
    if (q.cfg) return json(await M.config(), 200, "public, s-maxage=60");
    if (q.list) return json({ live: M.live(), mines: await M.listView() }, 200, "public, s-maxage=15");
    if (q.boards) return json(await M.boards(), 200, "public, s-maxage=30");
    if (q.stats) return json(await M.statsView(), 200, "public, s-maxage=30");
    if (q.creator != null) {
      if (!idOk(q.creator)) return json({ error: "bad id" }, 400);
      const v = await M.creatorView(Number(q.creator));
      return v ? json(v, 200, "public, s-maxage=60") : json({ error: "No such mine." }, 404);
    }
    if (q.builder) { if (!isAddr(q.builder)) return json({ error: "bad wallet" }, 400); return json(await M.builderView(q.builder)); }
    if (q.settle) {
      if (!authed(req, q)) return json({ error: "key required" }, 401);
      return json(await M.settleAll({ budgetMs: 45000 }));
    }
    if (q.work != null) {
      if (!idOk(q.work) || !isAddr(q.w)) return json({ error: "mine id and wallet required" }, 400);
      if (!M.session(q.s, q.w)) return json({ error: "Sign in again.", auth: true }, 401);
      const m = await M.mineInfo(q.work);
      if (!m) return json({ error: "No such mine." }, 404);
      const t = M.now();
      if (t < m.start) return json({ error: "This mine hasn't opened yet.", opensIn: m.start - t }, 409);
      if (t >= m.end) return json({ error: "This mine has ended." }, 409);
      const e = M.epochAt(m, t);
      return json({ epoch: e, challenge: M.challenge(Number(q.work), e, q.w), bits: M.GAME.shareBits, rush: M.rushOf(Number(q.work), e), heartBits: M.GAME.shareBits + M.GAME.heart.extra, endsIn: m.start + (e + 1) * M.GAME.epoch - t });
    }
    if (q.id != null) {
      if (!idOk(q.id)) return json({ error: "bad id" }, 400);
      if (q.w) {
        if (!isAddr(q.w)) return json({ error: "bad wallet" }, 400);
        const me = await M.meView(Number(q.id), q.w);
        return me ? json(me) : json({ error: "No such mine." }, 404);
      }
      const v = await M.mineView(Number(q.id));
      return v ? json(v, 200, "public, s-maxage=10") : json({ error: "No such mine." }, 404);
    }
    return json({ ok: true, live: M.live(), docs: "/api/mine?cfg=1" }, 200, "public, s-maxage=60");
  } catch (e) {
    console.error("mine GET", e);
    return json({ error: "Arc or storage didn't answer — try again in a moment." }, 502);
  }
}

export async function POST(req) {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  let b = {};
  try { b = await req.json(); } catch { b = {}; }
  try {
    if (q.auth) {
      const r = M.signIn(b.w, b.t, b.sig);
      return r.error ? json(r, 400) : json(r);
    }
    if (q.quests || q.crew) {
      if (!isAddr(b.w)) return json({ error: "wallet required" }, 400);
      if (!M.session(b.s, b.w)) return json({ error: "Sign in again.", auth: true }, 401);
      const r = q.quests ? await M.claimQuests(b.w) : await M.crewAct(b.w, String(q.crew), b.name);
      return r.error ? json(r, 409) : json(r);
    }
    if (q.look || q.prefs) {
      if (!isAddr(b.w)) return json({ error: "wallet required" }, 400);
      if (!M.session(b.s, b.w)) return json({ error: "Sign in again.", auth: true }, 401);
      const r = q.prefs ? await M.setPrefs(b.w, { xshare: !!b.xshare }) : await M.setLook(b.w, b.char, b.pet);
      return r.error ? json(r, 409) : json(r);
    }
    const id = q.shares != null ? q.shares : q.xpost;
    if (!idOk(id) || !isAddr(b.w)) return json({ error: "mine id and wallet required" }, 400);
    if (!M.live()) return json({ error: "Builder Mine isn't deployed yet — this is the practice mine." }, 409);
    if (!M.session(b.s, b.w)) return json({ error: "Sign in again.", auth: true }, 401);
    if (q.shares != null) {
      const r = await M.submitShares(Number(id), b.w, b.nonces);
      return r.error ? json(r, r.retry ? 429 : 409) : json(r);
    }
    if (q.xpost != null) {
      const r = await M.verifyPost(Number(id), b.w, b.url);
      return r.error ? json(r, 409) : json(r);
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("mine POST", e);
    return json({ error: "Arc or storage didn't answer — try again in a moment." }, 502);
  }
}
