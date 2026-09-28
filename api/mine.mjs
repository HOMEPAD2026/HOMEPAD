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
//   GET  /api/mine?settle=1&key=<CRON_SECRET> settle finished hours and post roots (arcia-tg's tick does this too)
import * as M from "./_mine.mjs";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };
const json = (o, status = 200, cache = "no-store") => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": cache, ...CORS } });
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const idOk = (x) => /^\d{1,6}$/.test(String(x || ""));
const authed = (req, q) => { const s = process.env.CRON_SECRET; return !!s && (q.key === s || req.headers.get("authorization") === `Bearer ${s}`); };

export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function GET(req) {
  const q = Object.fromEntries(new URL(req.url).searchParams);
  try {
    if (q.cfg) return json(await M.config(), 200, "public, s-maxage=60");
    if (q.list) return json({ live: M.live(), mines: await M.listView() }, 200, "public, s-maxage=15");
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
      return json({ epoch: e, challenge: M.challenge(Number(q.work), e, q.w), bits: M.GAME.shareBits, gold: M.GAME.goldBits, diamond: M.GAME.diamondBits, endsIn: m.start + (e + 1) * M.GAME.epoch - t });
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
    if (q.look) {
      if (!isAddr(b.w)) return json({ error: "wallet required" }, 400);
      if (!M.session(b.s, b.w)) return json({ error: "Sign in again.", auth: true }, 401);
      const r = await M.setLook(b.w, b.char, b.pet);
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
