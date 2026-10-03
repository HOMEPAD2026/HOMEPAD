// api/scan.mjs — Token Scanner v3 extras and the Plus / Pro tiers (rules in api/_scan-pro.mjs;
// the checks and the score are api/_scan-core.mjs, holders api/_scan.mjs, both also served by api/social.mjs).
// Free (no login):
//   GET  /api/scan?src=0x…[&impl=0x…]        published source code (explorer)
//   GET  /api/scan?dep=0x…&not=0x…            the contracts a deployer created, with their scanner scores
//   GET  /api/scan?fp=<fingerprint>&t=0x…     other scanned tokens with the same code
//   GET  /api/scan?note=0x…                   the project's own signed note
//   GET  /api/scan?rep=<id>                    a frozen report (JSON)     (/api/v1/report/<id>)
//   GET  /api/scan?reppage=<id>                a frozen report (page)     (/scan-report/<id>)
//   GET  /api/scan?embed=0x…                   the live embed card        (/embed/scan/<address>)
//   GET  /api/scan?msg=signin&w=0x…&t=<unix>   the text to sign to log in
//   GET  /api/scan?sol=<mint>                  v4: a Solana token (api/_scan-sol.mjs)
//   GET  /api/scan?drops=1[&chain=rh|sol]      v4: tokens whose score dropped 10+ in the last 3 days
//   GET  /api/scan?wtok=0x…[&chain=rh]         v4: the tokens a wallet holds, with their scores
// Plus / Pro (a signed-in wallet with the tool unlocked for 24 h):
//   POST /api/scan {action:"auth", w, t, sig}                 → session token (7 days)
//   GET  /api/scan?ent=1&w=0x…&s=<session>                    today's free unlocks, what's open
//   POST /api/scan {action:"unlock", w, s, f, subj, burnTx?}  open tool f for subj (3 free / 1 free a day, then a burn)
//   POST /api/scan {action:"share", w, s, url, token}         Pro's daily X post
//   GET  /api/scan?chart=0x…&w&s        (Plus) price + volume per hour, with events
//   GET  /api/scan?appr=<wallet>&w&s    (Plus) approvals that wallet has given
//   GET  /api/scan?feed=1&w&s           (Plus) new pools on Arc with scores
//   POST /api/scan {action:"notemsg"|"note", …}              (Plus) the owner's note
//   POST /api/scan {action:"report", w, s, token}            (Plus) freeze a report
//   GET  /api/scan?search=<q>&w&s       (Pro)  find a token by name, with copycat warnings
//   GET  /api/scan?take=0x…&w&s         (Pro)  ARCIA's take
//   POST /api/scan {action:"batch", w, s, tokens}            (Pro)  up to 25 tokens (/api/v1/scan/batch)
//   POST /api/scan {action:"hook", w, s, op, token, url, events, id}  (Pro) webhooks
import * as P from "./_scan-pro.mjs";
import * as scanner from "./_scan.mjs";
import * as SOL from "./_scan-sol.mjs";
import { isAddr } from "./_arc.mjs";

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, x-scan-wallet, x-scan-session" };
const json = (o, status = 200, cache = "no-store") => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": cache, ...CORS } });
const html = (s, status = 200, cache = "public, max-age=60, s-maxage=300", extra = {}) => new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": cache, ...extra } });
const lc = (a) => String(a || "").toLowerCase();
const ipOf = (req) => String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
const fail = (g) => json({ error: g.error, need: g.need, f: g.f, tier: g.tier }, g.status || 403);

export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function GET(req) {
  const url = new URL(req.url), q = Object.fromEntries(url.searchParams), ip = ipOf(req);
  const st = P.store();
  try {
    if (q.msg === "signin") return json({ msg: P.signInMessage(q.w, q.t) });
    if (q.src != null) {
      if (!isAddr(q.src)) return json({ error: "src must be an address" }, 400);
      if (scanner.limited(`src:${ip}`, 40, 60e3)) return json({ error: "slow down" }, 429);
      const r = await scanner.sourceOf(q.src, isAddr(q.impl) ? q.impl : null, st, q.chain === "rh" ? "rh" : "arc");
      return json(r || { unknown: true }, 200, r ? "public, max-age=600, s-maxage=3600" : "no-store");
    }
    if (q.dep != null) {
      if (!isAddr(q.dep)) return json({ error: "dep must be an address" }, 400);
      if (scanner.limited(`dep:${ip}`, 30, 60e3)) return json({ error: "slow down" }, 429);
      const r = await scanner.deployerOf(q.dep, q.not || "", st, q.chain === "rh" ? "rh" : "arc");
      return json(r || { unknown: true }, 200, r ? "public, max-age=300, s-maxage=1800" : "no-store");
    }
    if (q.fp != null) {
      const r = await scanner.clonesOf(q.fp, q.t || "", st, q.chain === "rh" ? "rh" : "arc");
      return json(r || { items: [] }, 200, "public, max-age=300, s-maxage=900");
    }
    // v4: Solana tokens, recent score drops, the tokens a wallet holds
    if (q.sol != null) {
      if (!SOL.isMint(q.sol)) return json({ error: "That isn't a Solana token address." }, 400);
      if (scanner.limited(`sol:${ip}`, 20, 60e3)) return json({ error: "too many scans — wait a minute" }, 429);
      const r = await SOL.scanSol(q.sol, { store: st });
      if (r && r.prevScore != null && r.score != null && r.prevScore - r.score >= 10) scanner.recordDrop(st, "sol", r.mint, r.symbol, r.prevScore, r.score, (r.critical || []).map((x) => x.title)).catch(() => null);
      return json(r, 200, r && !r.error ? "public, max-age=60, s-maxage=120" : "no-store");
    }
    if (q.drops != null) return json({ drops: await scanner.scanDrops(st, q.chain === "rh" ? "rh" : q.chain === "sol" ? "sol" : "arc") }, 200, "public, max-age=60, s-maxage=300");
    if (q.wtok != null) {
      if (!isAddr(q.wtok)) return json({ error: "That isn't a wallet address." }, 400);
      if (scanner.limited(`wtok:${ip}`, 12, 60e3)) return json({ error: "slow down" }, 429);
      const r = await scanner.walletTokens(q.wtok, st, q.chain === "rh" ? "rh" : "arc");
      return json(r || { error: "The explorer isn't answering right now." }, r ? 200 : 502, r ? "public, max-age=60, s-maxage=120" : "no-store");
    }
    if (q.note != null) return json({ note: await P.noteGet(q.note) }, 200, "public, max-age=30, s-maxage=60");
    if (q.rep != null) { const r = await P.reportGet(q.rep); return r ? json(r, 200, "public, max-age=3600, s-maxage=86400") : json({ error: "no such report" }, 404); }
    if (q.reppage != null) { const r = await P.reportGet(q.reppage); return html(P.reportPage(r), r ? 200 : 404, r ? "public, max-age=3600, s-maxage=86400" : "no-store"); }
    if (q.embed != null) {
      if (!isAddr(q.embed)) return html("<!doctype html><title>Not a token</title>", 400);
      let d = null;
      if (!scanner.limited(`emb:${ip}`, 60, 60e3)) d = await scanner.scoreOf(q.embed, { store: st, maxAgeMs: 6 * 3600e3 }).catch(() => null);
      return html(P.embedPage(lc(q.embed), d), 200, "public, max-age=600, s-maxage=1800, stale-while-revalidate=86400", { "content-security-policy": "frame-ancestors *" });
    }
    if (q.ent != null) {
      if (!P.session(q.s, q.w)) return json({ error: "Sign in with your wallet first.", need: "login" }, 401);
      return json(await P.status(q.w));
    }
    if (q.hooks != null) {
      if (!P.session(q.s, q.w)) return json({ error: "Sign in with your wallet first.", need: "login" }, 401);
      return json(await P.hookOp({ op: "list", w: q.w }));
    }
    if (q.chart != null) {
      const g = await P.gate(q, "chart", q.chart); if (g.error) return fail(g);
      return json(await P.chartOf(q.chart));
    }
    if (q.appr != null) {
      const g = await P.gate(q, "approvals", q.appr); if (g.error) return fail(g);
      return json(await P.approvalsOf(q.appr));
    }
    if (q.feed != null) {
      const g = await P.gate(q, "feed", "all"); if (g.error) return fail(g);
      return json(await P.feedOf());
    }
    if (q.search != null) {
      const g = await P.gate(q, "search", "all"); if (g.error) return fail(g);
      return json(await P.search(q.search));
    }
    if (q.take != null) {
      const g = await P.gate(q, "take", q.take); if (g.error) return fail(g);
      return json(await P.take(q.take));
    }
    return json({ error: "unknown request" }, 400);
  } catch (err) {
    console.error("scan GET", err && err.message || err);
    return json({ error: String(err && err.message || err).slice(0, 160) }, err && err.status ? err.status : 502);
  }
}

export async function POST(req) {
  const url = new URL(req.url), ip = ipOf(req);
  let b = {};
  try { b = (await req.json()) || {}; } catch { return json({ error: "bad JSON" }, 400); }
  // the public batch API: /api/v1/scan/batch with x-scan-wallet / x-scan-session headers
  if (url.searchParams.has("v1batch")) { b.action = "batch"; b.w = b.w || req.headers.get("x-scan-wallet"); b.s = b.s || req.headers.get("x-scan-session"); }
  if (scanner.limited(`scanpost:${ip}`, 40, 60e3)) return json({ error: "slow down" }, 429);
  try {
    const a = b.action;
    if (a === "auth") return json(P.signIn(b.w, b.t, b.sig));
    if (!P.session(b.s, b.w)) return json({ error: "Sign in with your wallet first.", need: "login" }, 401);
    if (a === "unlock") return json(await P.unlock(b.w, String(b.f || ""), b.subj || "all", { burnTx: b.burnTx || null }));
    if (a === "share") return json(await P.shareX(b.w, b.url, b.token));
    if (a === "notemsg") { const t = Math.floor(Date.now() / 1000); return json({ t, msg: P.noteMessage(b.token, b.w, t, String(b.text || "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, 500)) }); }
    if (a === "note") { const g = await P.gate(b, "note", b.token); if (g.error) return fail(g); return json(await P.noteSet(b)); }
    if (a === "report") { const g = await P.gate(b, "report", b.token); if (g.error) return fail(g); return json(await P.reportCreate(b.token, b.w)); }
    if (a === "batch") { const g = await P.gate(b, "batch", "all"); if (g.error) return fail(g); return json(await P.batch(b.tokens)); }
    if (a === "hook") {
      if (b.op === "add") { const g = await P.gate(b, "webhook", b.token); if (g.error) return fail(g); }
      return json(await P.hookOp(b));
    }
    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error("scan POST", b && b.action, err && err.message || err);
    return json({ error: String(err && err.message || err).slice(0, 160) }, err && err.status ? err.status : 502);
  }
}
