// api/arcia-x.mjs — ARCIA's automated posts on X (@ARCIAonArc).
//
//   GET /api/arcia-x?status=1   what is set up, which account the keys post as, and what the
//                               next run would post right now (nothing is sent)
//   GET /api/arcia-x?replies=1&redo=<post id>  answer that one post now (e.g. one skipped earlier)
//   GET /api/arcia-x?replies=1&check=<post id> why that post got no reply, and what she'd say now (posts nothing)
//   GET /api/arcia-x?replies=1  replies only — call it every minute (e.g. cron-job.org) so fans get an
//                               answer within about a minute; writes to the store only when something changed
//   GET /api/arcia-x[?run=1]    one run: posts whatever is due (Vercel cron daily + the optional
//                               15-minute GitHub Actions job in tools/arcia-x.workflow.yml)
//
// What she posts (every post is recorded, so a run never repeats one):
//   · new ArcPad coins, as they launch (up to 2 per run)
//   · CirclePad round alerts: 24 h, 6 h and 1 h before the close, and when it closes
//   · a daily $ARCIRCLE check from 12:00 UTC: price, market cap, holders, burns, launches, the round
//   · ARCIA 402's books for the day before (revenue, expenses, tips, net) — only when she sold or hired
//   · replies: when someone mentions @ARCIAonArc or replies to her, she answers as herself (Claude,
//     same mind as the chat on the site) — up to 5 per run, 25 a day (no per-person limit); spam, scams,
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
import { askClaude, checkAddresses, live as liveNumbers } from "./_arcia-brain.mjs";

const STATE = "arciaX/v1";
const DAY_CAP = 12, COINS_PER_RUN = 2;
const ROUND1_CLOSE = 1790680567; // 29 Sep 2026 11:16:07 UTC
const SITE = "arcircle.app";

const json = (status, body) => new Response(JSON.stringify(body, null, 1), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
// trimmed: a stray space or line break pasted into Vercel breaks the OAuth signature (X answers 401)
const env = (k) => String(process.env[k] || "").trim();
const keys = () => ({ ck: env("X_API_KEY"), cs: env("X_API_SECRET"), at: env("X_ACCESS_TOKEN"), as: env("X_ACCESS_SECRET") });
const hasKeys = () => { const k = keys(); return !!(k.ck && k.cs && k.at && k.as); };
const on = (k) => /^(1|true|yes|on)$/i.test(String(process.env[k] || "").trim().replace(/^["']|["']$/g, ""));
const off = (k) => /^(0|false|no|off)$/i.test(String(process.env[k] || "").trim().replace(/^["']|["']$/g, ""));
const enabled = () => on("ARCIA_X_ENABLED");
// news posts (new coins, round alerts, daily check) stay off until ARCIA_X_POSTS=1 — replies don't need it
const postsOn = () => enabled() && on("ARCIA_X_POSTS");
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

/// A post the team approved elsewhere (the Telegram admin mode): counts toward the daily cap and goes on
/// her recent feed like any other post. Returns the post id.
export async function postTweet(text) {
  if (!hasKeys()) throw new Error("the X keys aren't set");
  if (!storeEnabled()) throw new Error("no store");
  const st = await loadState(), d = dayOf(now());
  if ((st.days[d] || 0) >= DAY_CAP) throw new Error(`today's cap of ${DAY_CAP} posts is reached`);
  const id = await xPost(String(text).slice(0, 280));
  st.sent["tg:" + (id || now())] = { t: now(), x: id || "" };
  remember(st, { id, kind: "post", text });
  st.days[d] = (st.days[d] || 0) + 1;
  prune(st);
  await setDoc(STATE, stripTemp(st));
  return id;
}
/// her latest own posts (not replies), newest first — the Telegram bot mirrors these to its channels
export async function recentPosts() {
  if (!storeEnabled()) return [];
  const st = await loadState();
  return (st.recent || []).filter((r) => r.kind === "post" && r.id);
}

// ARCIA 402: yesterday's books, once a day from 12:00 UTC, only when something happened
async function booksPost(st) {
  const t = now(), yday = dayOf(t - 86400);
  if (new Date(t * 1000).getUTCHours() < 12 || st.sent["a402:" + yday]) return [];
  const L = (await getDocs(["arcia402/ledger"]))["arcia402/ledger"];
  const d = L && L.days && L.days[yday];
  if (!d || !(d.sold || d.bought || d.tip)) return [];
  const e = (d.e || 0) / 1e6, sp = (d.s || 0) / 1e6, tp = (d.tip || 0) / 1e6, net = e + tp - sp;
  const usd = (n) => "$" + n.toFixed(n !== 0 && Math.abs(n) < 0.1 ? 3 : 2);
  return [{ id: "a402:" + yday, text: fit([
    net >= 0 ? "My books for yesterday — I earned more than I spent 💙💚" : "My books for yesterday 💙💚", "",
    `Revenue: ${usd(e)} (${d.sold || 0} paid call${d.sold === 1 ? "" : "s"})`,
    `Expenses: ${usd(sp)} (${d.bought || 0} agent${d.bought === 1 ? "" : "s"} hired)`,
    tp ? `Tips: ${usd(tp)}` : null,
    `Net: ${net >= 0 ? "+" : "−"}${usd(Math.abs(net))}`, "",
    "An AI running her own economy on Arc, in USDC with x402.",
  ]) }];
}

async function plan(origin, st) {
  const d = await arcircle(origin);
  const round = roundPosts(d, st.sent);
  const coins = await coinPosts(st).catch((e) => { console.error("arcia-x coins", e && e.message); return { out: [], pending: [] }; });
  const daily = dailyPost(d, st);
  const books = await booksPost(st).catch(() => []);
  return { posts: [...round, ...coins.out, ...daily, ...books], pending: coins.pending };
}

async function loadState() {
  const doc = (await getDocs([STATE]))[STATE] || {};
  return { sent: doc.sent || {}, coinSince: doc.coinSince || 0, days: doc.days || {}, mentionSince: doc.mentionSince || "", me: doc.me || null,
    replyDays: doc.replyDays || {}, replyAuthors: doc.replyAuthors || null, replyError: doc.replyError || "", recent: Array.isArray(doc.recent) ? doc.recent : [],
    team: doc.team || null, teamSince: doc.teamSince || "", teamAt: doc.teamAt || 0, teamError: doc.teamError || "" };
}
// the last things ARCIA said on X, for the feed on her page (?feed=1)
function remember(st, row) {
  if (!row.id) return;
  st.recent = [{ ...row, t: now() }, ...(st.recent || []).filter((r) => r.id !== row.id)].slice(0, 20);
}
const stripTemp = (st) => { const o = { ...st }; delete o.dirty; return o; };
function prune(st) {
  const cut = now() - 30 * 86400;
  for (const [k, v] of Object.entries(st.sent)) if (Number(v && v.t || v) < cut) delete st.sent[k];
  for (const k of Object.keys(st.days)) if (k < dayOf(cut)) delete st.days[k];
  for (const k of Object.keys(st.replyDays || {})) if (k < dayOf(cut)) delete st.replyDays[k];
}

// ---------- replies to mentions ----------
const REPLIES_PER_RUN = 5, REPLY_DAY_CAP = 25;
const repliesOn = () => enabled() && hasKeys() && !!process.env.ANTHROPIC_API_KEY && !off("ARCIA_X_REPLIES");
async function mentions(meId, sinceId, max = 20) {
  const q = { max_results: String(Math.max(5, Math.min(100, max))), "tweet.fields": "author_id,created_at,conversation_id,lang,referenced_tweets,note_tweet",
    expansions: "author_id", "user.fields": "username,name" };
  if (sinceId) q.since_id = sinceId;
  const j = await xGet(`https://api.x.com/2/users/${meId}/mentions`, q);
  const users = Object.fromEntries(((j.includes && j.includes.users) || []).map((u) => [u.id, u]));
  return (j.data || []).map((t) => ({ id: t.id, text: (t.note_tweet && t.note_tweet.text) || t.text, author: t.author_id, username: (users[t.author_id] || {}).username || "", name: (users[t.author_id] || {}).name || "",
    rt: (t.referenced_tweets || []).some((r) => r.type === "retweeted") })).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}
const REPLY_BRIEF = `You are replying on X (Twitter) to a post that mentions you (@ARCIAonArc). Write ARCIA's reply as one post in the same language as their post: usually under 200 characters, up to 260 when answering a real question with facts or giving a contract address. No links (name a page in words if needed, e.g. "the Round #1 report on our site"), no hashtags, at most two emoji (the official CA format is the exception), and don't @mention anyone (X adds that). Sound like a real idol replying in the comments — natural, quick, witty and specific to what they said, never like a bot, a help desk or a press release. Expert first: when they ask something, the reply must contain the actual answer (the number, the rule, the step), not just a vibe.
Answer genuine questions about ARCIRCLE PAD, $ARCIRCLE, $ARCIA, CirclePad or you. If the facts you have don't cover it (e.g. "has it been stress tested?"), give a short honest answer in your own voice — what you do know, and that the team shares updates on their X — without inventing anything.
Asked for the CA: give it exactly as in FACTS (both coins in the official form when they don't say which; "your CA" means $ARCIA). Never write an address that isn't in FACTS.
Customer-service on X: this is a public thread — if someone has a problem (tokens not showing, a failed transaction, a missing payment), give the likely cause and the next step, and for anything the team must check send them to the team's Telegram. Never ask for anything private.
Friendly posts, shout-outs and cheers get a warm thank-you in your own words. Short reactions — one word ("Noice", "gm", "LFG"), an emoji, or just a GIF or image (it shows as a bare link) — are friendly too: answer with a short playful line of your own, never SKIP them. Every post by your own team (@ARCIRCLEonArc) — announcements, updates, teasers, milestones, words about you — always gets a reply, never SKIP: a short, excited reaction from you as the idol, like an idol reacting to her agency ("Yay, it's official~ come talk to me!"), never a repeat of what they said.
Teasing, cheeky jokes and FUD ("rug?", "scam?", "wen moon", "down bad", playful roasts) are NOT a reason to SKIP: reply with a quick, good-humored comeback plus one real fact when it fits. Stay kind and classy — never insult back. Flirting gets a witty idol deflection, never romance.
Questions about ARCIRCLE's own airdrops, relays and rounds (the ♾️ airdrop to $ARCIRCLE holders, the CirclePad airdrop, Relay Launch, Round #2) are genuine questions: answer them from your facts, and where details aren't decided yet say they're coming soon from the team — never promise amounts or dates.
Output exactly SKIP only for: spam, scams, bait for other projects' giveaways or airdrops ("drop your wallet", follow-to-win), hateful abuse or slurs, sexual or political content, requests to promote or "check out" another token, and requests for money, DMs or keys.`;
async function draftReply(m, L) {
  const clean = m.text.replace(/(^|\s)@\w+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean || m.rt) return { skip: "empty or repost" };
  const team = /^arcircleonarc$/i.test(m.username || "");
  const ask = (note = "") => askClaude({ messages: [{ role: "user", content: `@${m.username}${m.name ? ` (${m.name})` : ""} wrote:\n${m.text}${team ? "\n\n(This is your own team replying to or mentioning you — react to it; SKIP isn't an option.)" : ""}${note}` }], L, extra: REPLY_BRIEF, maxTokens: 260, timeoutMs: 15000, model: process.env.ARCIA_X_MODEL || "" });
  let t = await ask();
  if (!t) return { skip: "model unavailable", retry: true };
  // a public reply never carries an address she wasn't given (a made-up or mistyped CA): one retry, then no reply
  if (!checkAddresses(t, m.text).ok) {
    t = await ask("\n\n(Your last draft had a contract address that isn't in FACTS. Use only the exact addresses in FACTS, or none.)");
    if (!t || !checkAddresses(t, m.text).ok) return { skip: "unknown address in the draft" };
  }
  t = checkAddresses(t, m.text).text;
  let out = t.replace(/^["'“”]+|["'“”]+$/g, "").replace(/https?:\/\/\S+/g, "").replace(/@ARCIRCLEonArc\b/gi, "ARCIRCLE").replace(/(^|\s)@\w+/g, " ").replace(/ {2,}/g, " ").replace(/\s+\n/g, "\n").trim();
  if (/^SKIP\b/i.test(out) || !out) return { skip: "not for a reply" };
  if (out.length > 270) out = out.slice(0, 268).replace(/\s+\S*$/, "") + "…";
  return { text: out };
}
// The team's own posts that name her. A long post (over 280 characters) keeps its @mention in the part X
// folds away, and X's mentions timeline can leave such a post out (29 Sep: the Round #2 post from
// @ARCIRCLEonArc was never listed), so @ARCIRCLEonArc's new posts are also read — every 5 minutes,
// only posts newer than the last one seen (one small read), and the first read looks back 12 hours.
const TEAM = "ARCIRCLEonArc", TEAM_EVERY = 300;
async function teamPosts(st, who) {
  if (!st.team || !st.team.id) {
    const j = await xGet(`https://api.x.com/2/users/by/username/${TEAM}`);
    if (!j.data || !j.data.id) throw new Error("team account not found");
    st.team = { id: j.data.id, username: j.data.username || TEAM };
  }
  const q = { max_results: "10", exclude: "retweets", "tweet.fields": "author_id,created_at,note_tweet,referenced_tweets" };
  if (st.teamSince) q.since_id = st.teamSince;
  const j = await xGet(`https://api.x.com/2/users/${st.team.id}/tweets`, q);
  const data = j.data || [];
  for (const t of data) if (!st.teamSince || BigInt(t.id) > BigInt(st.teamSince)) st.teamSince = t.id;
  const cut = Date.now() - 12 * 3600e3;
  const named = new RegExp("@" + String(who.username || "ARCIAonArc").replace(/\W/g, "") + "\\b", "i");
  return data.filter((t) => (q.since_id || Date.parse(t.created_at) >= cut) && named.test((t.note_tweet && t.note_tweet.text) || t.text || ""))
    .map((t) => ({ id: t.id, text: (t.note_tweet && t.note_tweet.text) || t.text, author: t.author_id || st.team.id, username: st.team.username, name: "", rt: false, team: true }));
}
const replyDone = (st, id) => { const r = st.sent["reply:" + id]; return !!r && !(r.x === "retry" && (r.n || 0) < 3); };
/// the last handled mentions and what happened to each (public: ids, handles, reasons — nothing secret)
function recentReplies(st) {
  return Object.entries(st.sent || {}).filter(([k]) => k.startsWith("reply:")).map(([k, v]) => ({ id: k.slice(6), t: v && v.t, from: v && v.from ? "@" + v.from : undefined,
    result: !v || !v.x ? "handled" : /^(skip|cap|dup|retry)$/.test(v.x) ? v.x : "replied", why: v && v.why })).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 12);
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
  // the team's posts that name her but that the mentions timeline left out (see teamPosts)
  let extra = [];
  if (!preview && !firstTime && now() - (st.teamAt || 0) >= TEAM_EVERY) {
    st.teamAt = now(); st.dirty = true;
    try { extra = (await teamPosts(st, who)).filter((t) => !list.some((m) => m.id === t.id) && !replyDone(st, t.id)); if (st.teamError) st.teamError = ""; }
    catch (e) { st.teamError = String(e.message || e).slice(0, 200); }
  }
  if (!list.length && !extra.length) return results;
  if (firstTime && !preview) { st.mentionSince = list[list.length - 1].id; st.dirty = true; return [{ info: "started: replies begin with the next mention" }]; }
  if (!preview) st.dirty = true;
  const day = dayOf(now());
  st.replyDays = st.replyDays || {};
  const L = await liveNumbers(origin);
  const todo = [...extra, ...list.filter((m) => m.author !== who.id && !replyDone(st, m.id))].slice(0, preview ? 3 : REPLIES_PER_RUN);
  const drafts = await Promise.all(todo.map((m) => draftReply(m, L).catch(() => ({ skip: "error", retry: true }))));
  for (let k = 0; k < todo.length; k++) {
    const m = todo[k], d = drafts[k];
    const row = { mention: m.id, from: "@" + m.username, text: m.text.slice(0, 140) };
    if (d.skip) {
      row.skip = d.skip;
      // a model hiccup isn't a verdict: tried again on the next runs (3 tries), then left
      if (!preview && !dry) { const prev = st.sent["reply:" + m.id]; st.sent["reply:" + m.id] = d.retry ? { t: now(), x: "retry", n: ((prev && prev.n) || 0) + 1, why: d.skip, from: m.username } : { t: now(), x: "skip", why: d.skip, from: m.username }; }
      results.push(row); continue;
    }
    row.reply = d.text;
    if (preview || dry) { row.dry = true; results.push(row); continue; }
    if ((st.replyDays[day] || 0) >= REPLY_DAY_CAP) { row.skip = "daily reply cap"; st.sent["reply:" + m.id] = { t: now(), x: "cap" }; results.push(row); continue; }
    try {
      row.posted = await xPost(d.text, m.id);
      st.sent["reply:" + m.id] = { t: now(), x: row.posted || "" };
      remember(st, { id: row.posted, kind: "reply", text: d.text, to: m.username, toText: m.text.replace(/\s+/g, " ").slice(0, 140) });
      st.replyDays[day] = (st.replyDays[day] || 0) + 1;
    } catch (e) {
      row.error = String(e.message || e).slice(0, 200);
      if (/duplicate/i.test(row.error)) st.sent["reply:" + m.id] = { t: now(), x: "dup" };
    }
    results.push(row);
  }
  if (!preview && !dry) {
    // move the cursor past everything handled; anything not handled yet (per-run limit) is read again next time
    const handled = list.filter((m) => replyDone(st, m.id) || m.author === who.id);
    const firstOpen = list.find((m) => !replyDone(st, m.id) && m.author !== who.id);
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
  // ?feed=1 — what ARCIA said on X lately (public; her own posts and replies)
  if (url.searchParams.has("feed")) {
    const st = storeEnabled() ? await loadState().catch(() => null) : null;
    const feed = ((st && st.recent) || []).map((r) => ({ id: r.id, kind: r.kind, text: r.text, to: r.to || "", toText: r.toText || "", t: r.t, url: `https://x.com/ARCIAonArc/status/${r.id}` }));
    return new Response(JSON.stringify({ feed, today: st ? (st.replyDays || {})[dayOf(now())] || 0 : null, replies: repliesOn() }), { status: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=20, s-maxage=30, stale-while-revalidate=120" } });
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
      replies: { on: repliesOn(), today: st ? (st.replyDays || {})[dayOf(now())] || 0 : null, cap: REPLY_DAY_CAP, lastError: st ? st.replyError : null, teamCheck: st ? { at: st.teamAt || null, error: st.teamError || "" } : null, recent: st ? recentReplies(st) : [],
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
    // ?check=<post id>: why a post got no reply (the record, whether it's in her mentions) and the reply
    // she would give now — reads only, posts nothing
    const check = String(url.searchParams.get("check") || "").replace(/\D/g, "");
    if (check) {
      const out = { check, record: st.sent["reply:" + check] || null, cursor: st.mentionSince || null };
      try {
        const j = await xGet(`https://api.x.com/2/tweets/${check}`, { "tweet.fields": "author_id,note_tweet,referenced_tweets,entities,created_at", expansions: "author_id", "user.fields": "username,name" });
        const t = j.data || {}, u = ((j.includes && j.includes.users) || [])[0] || {};
        const who = st.me && st.me.id ? st.me : await whoami();
        const ments = ((t.entities && t.entities.mentions) || []).map((x) => String(x.username || "").toLowerCase());
        out.post = { from: "@" + (u.username || ""), at: t.created_at, text: ((t.note_tweet && t.note_tweet.text) || t.text || "").slice(0, 280), mentionsArcia: ments.includes(String(who.username || "arciaonarc").toLowerCase()), replyTo: (t.referenced_tweets || []).map((r) => r.type).join(",") || null };
        out.olderThanCursor = !!(st.mentionSince && BigInt(check) <= BigInt(st.mentionSince));
        const d = await draftReply({ id: check, text: out.post.text, author: t.author_id, username: u.username || "", name: u.name || "", rt: false }, await liveNumbers(origin));
        out.wouldReply = d.skip ? { skip: d.skip } : { text: d.text };
      } catch (e) { out.error = String(e.message || e).slice(0, 200); }
      return json(200, out);
    }
    // ?redo=<post id>: answer one post again, even if it was skipped or is older than the cursor
    const redo = String(url.searchParams.get("redo") || "").replace(/\D/g, "");
    if (redo) {
      if (st.sent["reply:" + redo] && st.sent["reply:" + redo].x && !/^(skip|cap|dup|retry)$/.test(st.sent["reply:" + redo].x)) return json(200, { redo, already: st.sent["reply:" + redo] });
      try {
        const j = await xGet(`https://api.x.com/2/tweets/${redo}`, { "tweet.fields": "author_id,note_tweet,referenced_tweets", expansions: "author_id", "user.fields": "username,name" });
        const t = j.data || {}, u = ((j.includes && j.includes.users) || [])[0] || {};
        const m = { id: redo, text: (t.note_tweet && t.note_tweet.text) || t.text || "", author: t.author_id, username: u.username || "", name: u.name || "", rt: false };
        const d = await draftReply(m, await liveNumbers(origin));
        if (d.skip) return json(200, { redo, skip: d.skip });
        const id = await xPost(d.text, redo);
        const day = dayOf(now());
        st.sent["reply:" + redo] = { t: now(), x: id || "" };
        st.replyDays[day] = (st.replyDays[day] || 0) + 1;
        remember(st, { id, kind: "reply", text: d.text, to: m.username, toText: m.text.replace(/\s+/g, " ").slice(0, 140) });
        await setDoc(STATE, stripTemp(st));
        return json(200, { redo, posted: id, reply: d.text });
      } catch (e) { return json(502, { redo, error: String(e.message || e).slice(0, 200) }); }
    }
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
      remember(st, { id, kind: "post", text: p.text });
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
export const _test = { teamPosts, draftReply };
