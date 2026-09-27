// api/arcia-x.mjs — ARCIA's automated posts on X (@ARCIAonArc).
//
//   GET /api/arcia-x?status=1   what is set up, which account the keys post as, and what the
//                               next run would post right now (nothing is sent)
//   GET /api/arcia-x?replies=1  replies only — call it every minute (e.g. cron-job.org) so fans get an
//                               answer within about a minute; writes to the store only when something changed
//   GET /api/arcia-x[?run=1]    one run: posts whatever is due (Vercel cron daily + the optional
//                               15-minute GitHub Actions job in tools/arcia-x.workflow.yml)
//
// What she posts (every post is recorded, so a run never repeats one):
//   · new ArcPad coins, as they launch (up to 2 per run)
//   · CirclePad round alerts: 24 h, 6 h and 1 h before the close, and when it closes
//   · a daily $ARCIRCLE check from 12:00 UTC: price, market cap, holders, burns, launches, the round
//   · replies: when someone mentions @ARCIAonArc or replies to her, she answers as herself (Claude,
//     same mind as the chat on the site) — up to 5 per run, 25 a day, 2 per person a day; spam, scams,
//     abuse and bait are skipped. Off with ARCIA_X_REPLIES=0. Needs ANTHROPIC_API_KEY.
// At most 12 posts a day. X bills per use: a post with a link costs far more than one without, so
// coin posts carry the contract address instead of a link, and replies never include links.
//
// Vercel environment variables:
//   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET  the @ARCIAonArc app keys (OAuth 1.0a)
//   ARCIA_X_ENABLED=1   switch ARCIA on for X (replies). Without it nothing is posted (see ?status=1 first)
//   ARCIA_X_POSTS=1     also the news posts (new coins, round alerts, daily check) — off until set
//   CRON_SECRET         optional; when set, ?run=1 needs "Authorization: Bearer <CRON_SECRET>"
//                       (Vercel's own cron sends it automatically)
//   FIREBASE_SERVICE_ACCOUNT  already set — where the record of sent posts is kept
import { createHmac, randomBytes } from "node:crypto";
import { allPools, getCoin, fmtUsd } from "./_arc.mjs";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";
import { askClaude, live as liveNumbers } from "./_arcia-brain.mjs";

const STATE = "arciaX/v1";
const DAY_CAP = 12, COINS_PER_RUN = 2;
const ROUND1_CLOSE = 1790680567; // 29 Sep 2026 11:16:07 UTC
const SITE = "arcircle.app";

const json = (status, body) => new Response(JSON.stringify(body, null, 1), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
// trimmed: a stray space or line break pasted into Vercel breaks the OAuth signature (X answers 401)
const env = (k) => String(process.env[k] || "").trim();
const keys = () => ({ ck: env("X_API_KEY"), cs: env("X_API_SECRET"), at: env("X_ACCESS_TOKEN"), as: env("X_ACCESS_SECRET") });
const hasKeys = () => { const k = keys(); return !!(k.ck && k.cs && k.at && k.as); };
const enabled = () => process.env.ARCIA_X_ENABLED === "1";
// news posts (new coins, round alerts, daily check) stay off until ARCIA_X_POSTS=1 — replies don't need it
const postsOn = () => enabled() && process.env.ARCIA_X_POSTS === "1";
const now = () => Math.floor(Date.now() / 1000);
const dayOf = (t) => new Date(t * 1000).toISOString().slice(0, 10);

// ---------- X API, OAuth 1.0a user context ----------
const pct = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
export function authHeader(method, url, query = {}, fixed = {}) {
  const k = keys();
  const o = { oauth_consumer_key: k.ck, oauth_nonce: fixed.nonce || randomBytes(16).toString("hex"), oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(fixed.ts || now()), oauth_token: k.at, oauth_version: "1.0" };
  const all = { ...query, ...o };
  const base = [method.toUpperCase(), pct(url), pct(Object.keys(all).sort().map((x) => `${pct(x)}=${pct(all[x])}`).join("&"))].join("&");
  o.oauth_signature = createHmac("sha1", `${pct(k.cs)}&${pct(k.as)}`).update(base).digest("base64");
  return "OAuth " + Object.keys(o).sort().map((x) => `${pct(x)}="${pct(o[x])}"`).join(", ");
}
async function xGet(base, query = {}) {
  const qs = Object.entries(query).map(([k, v]) => `${pct(k)}=${pct(v)}`).join("&");
  const r = await fetch(base + (qs ? "?" + qs : ""), { headers: { authorization: authHeader("GET", base, query) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`X ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j;
}
async function xPost(text, replyTo) {
  const url = "https://api.x.com/2/tweets";
  const payload = replyTo ? { text, reply: { in_reply_to_tweet_id: replyTo } } : { text };
  const r = await fetch(url, { method: "POST", headers: { authorization: authHeader("POST", url), "content-type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`X ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.data && j.data.id;
}
let me = null;
async function whoami() {
  if (me) return me;
  const url = "https://api.x.com/2/users/me";
  const r = await fetch(url, { headers: { authorization: authHeader("GET", url) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const k = keys();
    return { error: `X ${r.status}`, detail: String(j.detail || j.title || JSON.stringify(j)).slice(0, 200),
      hint: r.status === 401 ? "The four X keys don't sign in: check they are the API Key / API Key Secret and the Access Token / Access Token Secret of the same app, generated for @ARCIAonArc, and not regenerated since" : undefined,
      // format checks only (no key material): API Key ~25 chars, API Key Secret ~50, Access Token "<user id>-…", Access Token Secret ~45
      looksRight: { apiKey: k.ck.length >= 20 && k.ck.length <= 30, apiSecret: k.cs.length >= 45, accessToken: /^\d+-[A-Za-z0-9]{20,}$/.test(k.at), accessSecret: k.as.length >= 40 && k.as.length <= 50 } };
  }
  me = { id: j.data && j.data.id, username: j.data && j.data.username, name: j.data && j.data.name };
  return me;
}

// ---------- what's due ----------
const price = (v) => v == null ? "—" : "$" + (v < 0.0001 ? Number(v).toPrecision(3) : v < 1 ? Number(v).toFixed(6) : Number(v).toFixed(2));
const num = (v, d = 0) => v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d });
function left(s) {
  if (s <= 0) return "0m";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return (d ? d + "d " : "") + (h || d ? h + "h" : m + "m");
}
// X counts every link as 23 characters; keep a margin under 280
const xLen = (t) => t.replace(/(https?:\/\/)?[a-z0-9.-]+\.(app|world|com|me|io)\/?\S*/gi, "x".repeat(23)).length;
const fit = (lines) => { const out = lines.filter((l) => l != null); while (xLen(out.join("\n")) > 275 && out.length > 3) out.splice(out.length - 2, 1); return out.join("\n"); };

async function arcircle(origin) {
  try { const r = await fetch(origin + "/api/social?token=arcircle"); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

function roundPosts(d, sent) {
  const c = (d && d.revenue && d.revenue.circle) || {};
  const deadline = c.deadline || ROUND1_CLOSE, s = deadline - now();
  const raised = c.raised != null ? num(c.raised, 2) + " USDC" : null;
  const steps = [[86400, "24h"], [21600, "6h"], [3600, "1h"]];
  const due = steps.filter(([t, id]) => s > 0 && s <= t && !sent["round1:" + id]);
  const out = [];
  if (s <= 0 && !sent["round1:closed"] && s > -86400) {
    out.push({ id: "round1:closed", also: steps.map(([, id]) => "round1:" + id), text: fit([
      "CirclePad Round #1 has closed 🟢", "",
      raised ? `${raised} raised by the community.` : null,
      "Next: the vote result, the $ARCIA launch on Argus, the contributor airdrop and Relay N1.", "",
      `Round report: ${SITE}/circle/round/1`, "", "Thank you for building this with us 💙💚",
    ]) });
  } else if (due.length) {
    const [t, id] = due[due.length - 1]; // only the latest step, even if several are due
    const lead = id === "24h" ? "24 hours left in CirclePad Round #1 🟢" : id === "6h" ? "6 hours left in CirclePad Round #1 🟢" : "1 hour left in CirclePad Round #1 🟢";
    out.push({ id: "round1:" + id, also: steps.filter(([tt]) => tt > t).map(([, x]) => "round1:" + x), text: fit([
      lead, "",
      raised ? `${raised} raised so far.` : null,
      "Contributors get the $ARCIA airdrop and Relay N1. $ARCIRCLE holders can still burn-to-vote until the close.", "",
      "Closes Sep 29, 11:16 UTC", `${SITE}/circle`,
    ]) });
  }
  return out;
}

async function coinPosts(st) {
  const since = st.coinSince || now();
  const pools = (await allPools()).filter((p) => p.launchedAt > since && !st.sent["coin:" + p.token.toLowerCase()]).sort((a, b) => a.launchedAt - b.launchedAt);
  const out = [];
  for (const p of pools.slice(0, COINS_PER_RUN)) {
    const c = await getCoin(p.token).catch(() => null);
    if (!c) continue;
    const sym = String(c.symbol || "COIN").replace(/[^\w$.-]/g, "").slice(0, 16);
    const name = String(c.name || "").replace(/[@#\n]/g, "").slice(0, 40);
    out.push({ id: "coin:" + p.token.toLowerCase(), at: p.launchedAt, text: fit([
      `New on ArcPad: $${sym}${name && name.toUpperCase() !== sym.toUpperCase() ? " — " + name : ""}`, "",
      "A real Uniswap v4 pool on Circle's Arc from block one, liquidity locked.",
      c.mcapUsd != null ? `Market cap: ${fmtUsd(c.mcapUsd)}` : null, "",
      `CA: ${p.token}`, "", "Find it on ArcPad and scan it first. Always DYOR.",
    ]) });
  }
  return { out, pending: pools.map((p) => ({ id: "coin:" + p.token.toLowerCase(), at: p.launchedAt })) };
}

function dailyPost(d, st) {
  const t = now(), day = dayOf(t);
  if (new Date(t * 1000).getUTCHours() < 12 || st.sent["daily:" + day] || !d || d.price == null) return [];
  const c = (d.revenue && d.revenue.circle) || {};
  const ch = d.change24h != null ? ` (${d.change24h >= 0 ? "+" : ""}${d.change24h.toFixed(1)}% 24h)` : "";
  const roundLine = c.open && c.deadline > t ? `CirclePad Round #1: ${num(c.raised, 0)} USDC raised, ${left(c.deadline - t)} left` : null;
  return [{ id: "daily:" + day, text: fit([
    "ARCIA's daily $ARCIRCLE check 💙💚", "",
    `Price: ${price(d.price)}${ch}`,
    `Market cap: ${fmtUsd(d.mcap)}`,
    d.holders != null ? `Holders: ${num(d.holders)}` : null,
    d.burned && d.burned.pct != null ? `Burned forever: ${d.burned.pct.toFixed(2)}%` : null,
    d.revenue && d.revenue.launches != null ? `ArcPad launches: ${num(d.revenue.launches)}` : null,
    roundLine, "",
    `${SITE}/stats`,
  ]) }];
}

async function plan(origin, st) {
  const d = await arcircle(origin);
  const round = roundPosts(d, st.sent);
  const coins = await coinPosts(st).catch((e) => { console.error("arcia-x coins", e && e.message); return { out: [], pending: [] }; });
  const daily = dailyPost(d, st);
  return { posts: [...round, ...coins.out, ...daily], pending: coins.pending };
}

async function loadState() {
  const doc = (await getDocs([STATE]))[STATE] || {};
  return { sent: doc.sent || {}, coinSince: doc.coinSince || 0, days: doc.days || {}, mentionSince: doc.mentionSince || "", me: doc.me || null,
    replyDays: doc.replyDays || {}, replyAuthors: doc.replyAuthors || null, replyError: doc.replyError || "" };
}
const stripTemp = (st) => { const o = { ...st }; delete o.dirty; return o; };
function prune(st) {
  const cut = now() - 30 * 86400;
  for (const [k, v] of Object.entries(st.sent)) if (Number(v && v.t || v) < cut) delete st.sent[k];
  for (const k of Object.keys(st.days)) if (k < dayOf(cut)) delete st.days[k];
  for (const k of Object.keys(st.replyDays || {})) if (k < dayOf(cut)) delete st.replyDays[k];
}

// ---------- replies to mentions ----------
const REPLIES_PER_RUN = 5, REPLY_DAY_CAP = 25, PER_AUTHOR_DAY = 2;
const repliesOn = () => enabled() && hasKeys() && !!process.env.ANTHROPIC_API_KEY && process.env.ARCIA_X_REPLIES !== "0";
async function mentions(meId, sinceId, max = 20) {
  const q = { max_results: String(Math.max(5, Math.min(100, max))), "tweet.fields": "author_id,created_at,conversation_id,lang,referenced_tweets",
    expansions: "author_id", "user.fields": "username,name" };
  if (sinceId) q.since_id = sinceId;
  const j = await xGet(`https://api.x.com/2/users/${meId}/mentions`, q);
  const users = Object.fromEntries(((j.includes && j.includes.users) || []).map((u) => [u.id, u]));
  return (j.data || []).map((t) => ({ id: t.id, text: t.text, author: t.author_id, username: (users[t.author_id] || {}).username || "", name: (users[t.author_id] || {}).name || "",
    rt: (t.referenced_tweets || []).some((r) => r.type === "retweeted") })).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}
const REPLY_BRIEF = `You are replying on X (Twitter) to a post that mentions you (@ARCIAonArc). Write ARCIA's reply as one short post: at most 220 characters, in the same language as their post, no links, no hashtags, at most one emoji, and don't @mention anyone (X adds that). Sound like a real idol replying to a fan in the comments — natural, warm, specific to what they said — never like a bot or a help desk.
If the post is spam, a scam or giveaway bait, abusive, sexual, political, asks you to promote or "check out" another token, asks for money, DMs or keys, or simply doesn't need an answer, output exactly SKIP.`;
async function draftReply(m, L) {
  const clean = m.text.replace(/(^|\s)@\w+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean || m.rt) return { skip: "empty or repost" };
  const t = await askClaude({ messages: [{ role: "user", content: `@${m.username}${m.name ? ` (${m.name})` : ""} wrote:\n${m.text}` }], L, extra: REPLY_BRIEF, maxTokens: 220, timeoutMs: 15000 });
  if (!t) return { skip: "model unavailable" };
  let out = t.replace(/^["'“”]+|["'“”]+$/g, "").replace(/https?:\/\/\S+/g, "").replace(/(^|\s)@\w+/g, " ").replace(/\s+\n/g, "\n").trim();
  if (/^SKIP\b/i.test(out) || !out) return { skip: "not for a reply" };
  if (out.length > 270) out = out.slice(0, 268).replace(/\s+\S*$/, "") + "…";
  return { text: out };
}
async function replyRun(origin, st, { dry = false, preview = false } = {}) {
  const results = [];
  let who = st.me && st.me.id ? st.me : null;
  if (!who) {
    who = await whoami();
    if (!who || !who.id) return [{ error: "can't read the X account (" + (who && who.error || "no id") + ")" }];
    st.me = { id: who.id, username: who.username || "" };
    st.dirty = true;
  }
  const firstTime = !st.mentionSince;
  let list;
  try { list = await mentions(who.id, preview ? null : st.mentionSince, preview ? 5 : 20); }
  catch (e) { st.replyError = String(e.message || e).slice(0, 200); st.dirty = true; return [{ error: "mentions: " + st.replyError }]; }
  if (st.replyError) { st.replyError = ""; st.dirty = true; }
  if (!list.length) return results;
  if (firstTime && !preview) { st.mentionSince = list[list.length - 1].id; st.dirty = true; return [{ info: "started: replies begin with the next mention" }]; }
  if (!preview) st.dirty = true;
  const day = dayOf(now());
  st.replyDays = st.replyDays || {}; st.replyAuthors = st.replyAuthors && st.replyAuthors.day === day ? st.replyAuthors : { day, n: {} };
  const L = await liveNumbers(origin);
  const todo = list.filter((m) => m.author !== who.id && !st.sent["reply:" + m.id]).slice(0, preview ? 3 : REPLIES_PER_RUN);
  const drafts = await Promise.all(todo.map((m) => draftReply(m, L).catch(() => ({ skip: "error" }))));
  for (let k = 0; k < todo.length; k++) {
    const m = todo[k], d = drafts[k];
    const row = { mention: m.id, from: "@" + m.username, text: m.text.slice(0, 140) };
    if (d.skip) { row.skip = d.skip; if (!preview && !dry) st.sent["reply:" + m.id] = { t: now(), x: "skip" }; results.push(row); continue; }
    row.reply = d.text;
    if (preview || dry) { row.dry = true; results.push(row); continue; }
    if ((st.replyDays[day] || 0) >= REPLY_DAY_CAP) { row.skip = "daily reply cap"; st.sent["reply:" + m.id] = { t: now(), x: "cap" }; results.push(row); continue; }
    if ((st.replyAuthors.n[m.author] || 0) >= PER_AUTHOR_DAY) { row.skip = "enough replies to this person today"; st.sent["reply:" + m.id] = { t: now(), x: "skip" }; results.push(row); continue; }
    try {
      row.posted = await xPost(d.text, m.id);
      st.sent["reply:" + m.id] = { t: now(), x: row.posted || "" };
      st.replyDays[day] = (st.replyDays[day] || 0) + 1;
      st.replyAuthors.n[m.author] = (st.replyAuthors.n[m.author] || 0) + 1;
    } catch (e) {
      row.error = String(e.message || e).slice(0, 200);
      if (/duplicate/i.test(row.error)) st.sent["reply:" + m.id] = { t: now(), x: "dup" };
    }
    results.push(row);
  }
  if (!preview && !dry) {
    // move the cursor past everything handled; anything not handled yet (per-run limit) is read again next time
    const handled = list.filter((m) => st.sent["reply:" + m.id] || m.author === who.id);
    const firstOpen = list.find((m) => !st.sent["reply:" + m.id] && m.author !== who.id);
    const upto = firstOpen ? list[list.indexOf(firstOpen) - 1] : list[list.length - 1];
    if (upto && handled.length) st.mentionSince = upto.id;
  }
  return results;
}

export async function GET(req) {
  const url = new URL(req.url);
  const origin = url.origin;
  // the ARCIA page asks this to show which feeds are live (cheap: no chain reads, no X call)
  if (url.searchParams.get("status") === "lite") {
    const on = postsOn() && hasKeys();
    return new Response(JSON.stringify({ live: { coins: on, round: on, daily: on, replies: repliesOn(), trends: false } }), { status: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=60, s-maxage=300" } });
  }
  if (url.searchParams.has("status")) {
    const st = storeEnabled() ? await loadState().catch(() => null) : null;
    const p = st ? await plan(origin, st).catch((e) => ({ posts: [], error: String(e.message || e) })) : { posts: [] };
    return json(200, {
      keys: hasKeys(), enabled: enabled(), posts: postsOn(), store: storeEnabled(), cronSecret: !!process.env.CRON_SECRET,
      account: hasKeys() ? await whoami().catch(() => ({ error: "unreachable" })) : null,
      today: st ? st.days[dayOf(now())] || 0 : null, cap: DAY_CAP,
      firstRun: st ? !st.coinSince : null,
      wouldPost: p.posts.map((x) => ({ id: x.id, chars: xLen(x.text), text: x.text })),
      replies: { on: repliesOn(), today: st ? (st.replyDays || {})[dayOf(now())] || 0 : null, cap: REPLY_DAY_CAP, lastError: st ? st.replyError : null,
        preview: url.searchParams.get("status") === "replies" && hasKeys() && st ? await replyRun(origin, st, { preview: true }).catch((e) => [{ error: String(e.message || e) }]) : "open ?status=replies to draft replies to the latest mentions (reads up to 5 mentions, posts nothing)" },
      live: { coins: true, round: true, daily: true, trends: false },
    });
  }
  // ?replies=1 — the fast path an every-minute pinger calls: only answers new mentions
  if (url.searchParams.has("replies")) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}` && url.searchParams.get("key") !== secret) return json(401, { error: "unauthorized" });
    if (!repliesOn()) return json(200, { replies: "off", need: "ARCIA_X_ENABLED=1, the four X keys and ANTHROPIC_API_KEY" });
    if (!storeEnabled()) return json(503, { error: "no store" });
    const st = await loadState();
    const replies = await replyRun(origin, st).catch((e) => [{ error: String(e.message || e).slice(0, 200) }]);
    if (st.dirty) { prune(st); await setDoc(STATE, stripTemp(st)); } // nothing new → no write
    return json(200, { replies });
  }
  // anything else is a run (Vercel's cron calls the bare path); runs are idempotent — nothing is posted twice
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return json(401, { error: "unauthorized" });
  if (!storeEnabled()) return json(503, { error: "no store — can't keep a record of sent posts" });
  const st = await loadState();
  const firstRun = !st.coinSince;
  const { posts, pending } = await plan(origin, st);
  // the very first run only starts the clock for new coins, so older launches never flood the feed
  const due = !postsOn() ? [] : firstRun ? posts.filter((p) => !p.id.startsWith("coin:")) : posts;
  const day = dayOf(now());
  const results = [];
  for (const p of due) {
    if ((st.days[day] || 0) >= DAY_CAP) { results.push({ id: p.id, skipped: "daily cap" }); continue; }
    if (!hasKeys()) { results.push({ id: p.id, dry: true, text: p.text }); continue; }
    try {
      const id = await xPost(p.text);
      st.sent[p.id] = { t: now(), x: id || "" };
      for (const a of p.also || []) st.sent[a] = { t: now(), x: "" };
      st.days[day] = (st.days[day] || 0) + 1;
      results.push({ id: p.id, posted: id });
    } catch (e) {
      const msg = String(e.message || e);
      if (/duplicate/i.test(msg)) st.sent[p.id] = { t: now(), x: "dup" };
      results.push({ id: p.id, error: msg.slice(0, 200) });
      if (/\b(401|403|429)\b/.test(msg) && !/duplicate/i.test(msg)) break; // keys / rate limit: stop this run
    }
  }
  const replies = repliesOn() ? await replyRun(origin, st).catch((e) => [{ error: String(e.message || e).slice(0, 200) }]) : [];
  if (postsOn() && hasKeys()) {
    // new coins: the clock starts at the first run; later it moves up to just before the oldest coin not yet posted
    if (firstRun) st.coinSince = now();
    else {
      const rest = pending.filter((p) => !st.sent[p.id]);
      if (rest.length) st.coinSince = Math.max(st.coinSince, Math.min(...rest.map((p) => p.at)) - 1);
      else if (pending.length) st.coinSince = Math.max(st.coinSince, ...pending.map((p) => p.at));
    }
  }
  if (enabled() && hasKeys()) { prune(st); await setDoc(STATE, stripTemp(st)); }
  return json(200, { enabled: enabled(), posts: postsOn(), firstRun, results, replies });
}
