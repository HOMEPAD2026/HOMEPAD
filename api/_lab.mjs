// api/_lab.mjs — ARCIA LAB: ARCIA reads what the internet is talking about, turns it into an ORIGINAL meme coin,
// launches it on ArcPad by herself and runs it in public. Routed through api/arcia402.mjs (?lab=…).
//
// One tick (cron, every 15 minutes; see tick()) does whatever is due, in this order:
//   ops      posts a new coin on X and Telegram, scans it with the Token Scanner, the daily digest of her coins
//   fees     her creator fees, by a fixed public rule (fees()): coin fees → 0x…dEaD (burned); USDC fees → the
//            ARCIRCLE fee burn (ArcircleFeeBurn, which buys $ARCIRCLE and burns it) at LAB_BURN_BPS, the rest pays
//            for the next launches
//   plan     signals (X posts of the accounts she watches, Google Trends, Reddit, CoinGecko / DexScreener trending,
//            links the community sends) → three coin concepts from Claude → a second, independent review → the pick
//   art      an original mascot (OpenAI image when OPENAI_API_KEY is set, else her own SVG), hosted like any logo
//   ask      the team gets the concept on Telegram (ARCIA bot admins, DM) with Launch / Skip — nothing that spends
//            money happens without that tap; no answer in 12 hours = skipped
//   launch   on Launch: ArcPad launch from her Lab wallet with a small dev buy, the dev buy locked in ArcLock at once
//
// What she never does (enforced here, not only asked of the model):
//   · no coin named after, picturing or implying a real person, a brand, a company or someone else's character —
//     a viral post is only a source of ideas, and no name from it appears on the coin or in its posts
//   · no trading of her own coins: the only buy is the dev buy at launch, locked; coin fees are burned, never sold
//   · no promises of price or profit in anything she writes
//
// Vercel environment variables:
//   ARCIA_LAB_KEY        the Lab wallet's key (a NEW wallet used only for this; fund it with a little USDC on Arc).
//                        Without it the Lab runs "dry": it plans and shows what it would launch, and sends nothing.
//   ARCIA_LAB            off | dry | live (default live — live still needs the key)
//   ARCIA_LAB_PER_DAY    launches a day, 0–3 (default 1)          ARCIA_LAB_HOUR   UTC hour of the first slot (14)
//   ARCIA_LAB_DEV_BUY    USDC of dev buy, 0–50 (default 5)        ARCIA_LAB_LOCK_DAYS   lock of the dev buy (30)
//   ARCIA_LAB_FEE_BPS    the coin's extra creator fee, 0–200 bps (default 50)
//   ARCIA_LAB_BURN_BPS   share of USDC fees sent to the $ARCIRCLE fee burn (default 5000 = 50%)
//   ARCIA_LAB_X_WATCH    X accounts she reads for ideas (default "elonmusk"; at most 3; uses the @ARCIAonArc keys)
//   ARCIA_LAB_X=0 / ARCIA_LAB_TG=0   no posts on X / Telegram       ARCIA_LAB_TG_CHAT   another Telegram chat
//   OPENAI_API_KEY (+ ARCIA_LAB_IMAGE_MODEL, default gpt-image-1)  painted mascots; else her SVG ones
//   ANTHROPIC_API_KEY    required for concepts (without it nothing is planned)
import { createHash, randomBytes } from "node:crypto";
import { rpcCall, ethCalls, getLogs, isAddr, pad, strip, keccakHex, getCoin, SITE } from "./_arc.mjs";
import { sendTx, addressOfKey } from "./_x402.mjs";
import { storeEnabled, getDocs, setDoc } from "./_store.mjs";
import { askClaude } from "./_arcia-brain.mjs";

const STATE = "arciaLab/v1";
const lc = (a) => String(a || "").toLowerCase();
const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
const now = () => Math.floor(Date.now() / 1000);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const intOr = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const numOr = (v, d) => { const n = Number(v); return v !== "" && Number.isFinite(n) ? n : d; };
const dayOf = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hexOf = (s) => Buffer.from(String(s), "utf8").toString("hex");
const sel = (sig) => keccakHex(hexOf(sig)).slice(0, 10);
const u256 = (n) => BigInt(n).toString(16).padStart(64, "0");
const word = (h, i) => BigInt("0x" + (strip(h || "0x").slice(i * 64, i * 64 + 64) || "0"));

// ---------------- addresses (Arc mainnet; the local test copy rewrites the ArcPad ones) ----------------
export const ADDR = {
  factory: "0x0ebd6df354056ff469F17F8Fd14dc0D2c87bd65E",
  hook: "0x484D416E73Eb44d276DDeF04cDBAdf2f4907c044",
  usdc: "0x3600000000000000000000000000000000000000",
  arclock: "0x64F893947Fe2c4fe7058CFba899eA269CBa9F006",
  feeBurn: "0x7f53f5014bc2cfe52ed8fb9370f2bcd497b93034",
  dead: "0x000000000000000000000000000000000000dEaD",
};
const START_RESERVE = 4000n * 10n ** 6n; // every ArcPad launch opens at a 4,000 USDC virtual reserve
const GAS_RESERVE = 5n * 10n ** 17n; // 0.5 USDC kept for gas (native, 18 dp)

export const CFG = {
  key: () => env("ARCIA_LAB_KEY") || null,
  mode: () => { const m = lc(env("ARCIA_LAB")); return m === "off" || m === "0" ? "off" : m === "dry" ? "dry" : "live"; },
  perDay: () => clamp(intOr(env("ARCIA_LAB_PER_DAY"), 1), 0, 3),
  hour: () => clamp(intOr(env("ARCIA_LAB_HOUR"), 14), 0, 23),
  devBuy: () => clamp(numOr(env("ARCIA_LAB_DEV_BUY"), 5), 0, 50),
  lockDays: () => clamp(intOr(env("ARCIA_LAB_LOCK_DAYS"), 30), 7, 365),
  feeBps: () => clamp(intOr(env("ARCIA_LAB_FEE_BPS"), 50), 0, 200),
  burnBps: () => clamp(intOr(env("ARCIA_LAB_BURN_BPS"), 5000), 0, 10000),
  watch: () => (env("ARCIA_LAB_X_WATCH") || "elonmusk").split(",").map((s) => s.trim().replace(/^@/, "")).filter((s) => /^[A-Za-z0-9_]{1,15}$/.test(s)).slice(0, 3),
  xPosts: () => env("ARCIA_LAB_X") !== "0",
  tgPosts: () => env("ARCIA_LAB_TG") !== "0",
  // injectable for tests
  store: null, fetch: null, now: null, ai: null, image: null, x: null, tg: null, scan: null, approve: null,
};
export function configure(o) { Object.assign(CFG, o); }
const T0 = () => (CFG.now ? CFG.now() : now());
const F = (...a) => (CFG.fetch || fetch)(...a);
const labAddr = () => { const k = CFG.key(); return k ? lc(addressOfKey(k)) : null; };

// ---------------- store ----------------
function store() {
  if (CFG.store) return CFG.store;
  if (!storeEnabled()) return null;
  return { get: async (k) => (await getDocs([k]))[k] || null, set: (k, d) => setDoc(k, d) };
}
const fresh = () => ({ v: 1, coins: [], plans: [], log: [], tips: [], names: [], fees: { block: 0, usdcIn: "0", sentToBurn: "0", tokensBurned: 0, at: 0, pending: "0" }, x: { ids: {}, at: 0, posts: [] }, digest: "", pause: "", lease: 0 });
async function load() {
  const st = store(); if (!st) return fresh();
  const d = await st.get(STATE).catch(() => null);
  return d ? { ...fresh(), ...d, fees: { ...fresh().fees, ...(d.fees || {}) }, x: { ...fresh().x, ...(d.x || {}) } } : fresh();
}
async function save(s) {
  const st = store(); if (!st) return;
  s.log = (s.log || []).slice(-200); s.plans = (s.plans || []).slice(-6); s.tips = (s.tips || []).slice(-40); s.names = (s.names || []).slice(-120);
  await st.set(STATE, s);
}
function log(s, kind, text, extra = {}) { s.log.push({ t: T0(), kind, text: String(text).slice(0, 300), ...extra }); }

// ---------------- the rules on names ----------------
// Real people, brands, companies, other people's characters and other coins' names. Matched as whole words in
// the name, the ticker and every public line; the model is told the same and a second review looks again.
const BANNED = ("elon musk elonmusk trump melania barron biden kamala obama putin zelensky netanyahu jinping modi kanye " +
  "taylorswift beyonce rihanna drake mrbeast kardashian zuckerberg zuck bezos altman saylor vitalik buterin satoshi nakamoto " +
  "changpeng gensler ronaldo messi lebron " +
  "tesla spacex starlink neuralink twitter grok xai openai chatgpt anthropic claude apple google alphabet microsoft facebook instagram tiktok " +
  "youtube amazon nvidia nike adidas disney marvel pixar netflix pokemon pikachu nintendo mario luigi zelda sega " +
  "mickey spongebob simpsons shrek minecraft fortnite roblox pepe wojak doge dogecoin kabosu shiba inu bonk dogwifhat floki " +
  "bitcoin ethereum solana binance coinbase robinhood usdc tether ripple cardano " +
  "nazi hitler isis terrorist shooting massacre genocide rape porn nsfw onlyfans child children loli").split(/\s+/);
const MULTI = ["xi jinping", "hello kitty", "shiba inu", "justin sun", "king charles", "taylor swift", "bill gates", "michael jordan", "donald trump", "kamala harris", "sonic the hedgehog", "the pope"];
const TOP_TICKERS = "BTC ETH USDT USDC BNB SOL XRP DOGE ADA TRX TON SHIB AVAX LINK DOT PEPE BONK WIF FLOKI TRUMP MELANIA SUI APT ARB OP POPCAT MOG BRETT NEIRO GOAT PNUT TURBO MEW BOME SPX FARTCOIN ARCIRCLE ARCIA HOME OMNI".split(" ");
export function nameProblem(c, extraTickers = []) {
  const name = String(c.name || "").trim(), sym = String(c.symbol || "").trim().toUpperCase();
  if (!/^[A-Za-z0-9][A-Za-z0-9 .'-]{1,23}$/.test(name)) return "the name must be 2–24 plain letters or digits";
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(sym)) return "the ticker must be 2–8 capital letters or digits";
  const text = ` ${[name, sym, c.story, c.art].join(" ").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  for (const m of MULTI) if (text.includes(` ${m} `)) return `"${m}" is a real person, brand or someone else's character`;
  for (const w of BANNED) if (w.length > 2 && text.includes(` ${w} `)) return `"${w}" is a real person, brand, another coin or off-limits`;
  if (TOP_TICKERS.includes(sym) || extraTickers.map((t) => String(t).toUpperCase()).includes(sym)) return `$${sym} is already another coin's ticker`;
  if (/\b(100x|1000x|moon(ing)?|guaranteed|profit|get rich|financial advice|price will)\b/i.test(String(c.story || ""))) return "the story promises gains";
  return null;
}
const promiseFree = (t) => !/\b(100x|1000x|guaranteed|get rich|price will|to the moon)\b/i.test(String(t || ""));

// ---------------- signals ----------------
async function getText(url, ms = 7000, headers = {}) {
  const r = await F(url, { headers: { "user-agent": "arcircle-lab/1.0 (+https://www.arcircle.app/arc#lab)", ...headers }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}
const getJson = async (url, ms, headers) => JSON.parse(await getText(url, ms, headers));
const clean = (s, n = 200) => String(s || "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, n);
const decodeXml = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function sigGoogle() {
  const xml = await getText("https://trends.google.com/trending/rss?geo=US");
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 12).map((m) => {
    const t = decodeXml((/<title>([\s\S]*?)<\/title>/.exec(m[1]) || [])[1]);
    const tr = decodeXml((/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/.exec(m[1]) || [])[1]);
    return { src: "Google Trends", text: clean(t, 120), meta: tr ? `${tr} searches` : "" };
  }).filter((x) => x.text);
}
async function sigReddit() {
  const out = [];
  for (const sub of ["memes+dankmemes+me_irl", "CryptoCurrency+memecoins"]) {
    try {
      const j = await getJson(`https://www.reddit.com/r/${sub}/top.json?t=day&limit=8`);
      for (const c of (j.data && j.data.children) || []) if (c.data && !c.data.over_18) out.push({ src: "Reddit", text: clean(c.data.title, 160), meta: `r/${c.data.subreddit} · ${c.data.ups} upvotes` });
    } catch { /* Reddit may refuse a cloud IP */ }
  }
  return out;
}
async function sigCoinGecko() {
  const j = await getJson("https://api.coingecko.com/api/v3/search/trending");
  const coins = ((j && j.coins) || []).slice(0, 10).map((c) => c.item || {});
  return { list: coins.map((c) => ({ src: "CoinGecko trending", text: clean(`${c.name} ($${c.symbol})`, 80), meta: c.market_cap_rank ? `rank ${c.market_cap_rank}` : "" })), tickers: coins.map((c) => c.symbol).filter(Boolean) };
}
async function sigDex() {
  const j = await getJson("https://api.dexscreener.com/token-profiles/latest/v1");
  return (Array.isArray(j) ? j : []).filter((p) => p.description).slice(0, 8).map((p) => ({ src: "DexScreener new profiles", text: clean(p.description, 140), meta: p.chainId || "" }));
}
/// posts of the X accounts she watches — read at most every 6 hours (X bills per read)
async function sigX(s) {
  const watch = CFG.watch();
  if (!watch.length) return [];
  if (s.x.at && T0() - s.x.at < 6 * 3600 && (s.x.posts || []).length) return s.x.posts;
  const x = CFG.x || (await import("./arcia-x.mjs").then((m) => ({ get: (url, q) => xGet(m.authHeader, url, q) })).catch(() => null));
  if (!x || !(env("X_API_KEY") || CFG.x)) return s.x.posts || [];
  const posts = [];
  for (const u of watch) {
    try {
      let id = s.x.ids[u];
      if (!id) { const j = await x.get(`https://api.x.com/2/users/by/username/${u}`, {}); id = j && j.data && j.data.id; if (id) s.x.ids[u] = id; }
      if (!id) continue;
      const j = await x.get(`https://api.x.com/2/users/${id}/tweets`, { max_results: "5", exclude: "retweets,replies", "tweet.fields": "created_at,public_metrics" });
      for (const t of (j && j.data) || []) posts.push({ src: `X · @${u}`, text: clean(t.text, 200), meta: t.public_metrics ? `${t.public_metrics.like_count} likes` : "" });
    } catch { /* keys, credits or limits — skip */ }
  }
  s.x.at = T0(); s.x.posts = posts.slice(0, 12);
  return s.x.posts;
}
async function xGet(authHeader, url, query) {
  const qs = new URLSearchParams(query).toString();
  const r = await F(url + (qs ? `?${qs}` : ""), { headers: { authorization: authHeader("GET", url, query) }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`X ${r.status}`);
  return r.json();
}
/// community tips: a TikTok link gets its title from TikTok's public oEmbed; others count by their note
async function sigTips(s) {
  const out = [];
  for (const t of (s.tips || []).filter((t) => T0() - t.t < 3 * 86400).slice(-10)) {
    let title = t.title || "";
    if (!title && /tiktok\.com\//.test(t.url)) { try { const j = await getJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(t.url)}`, 5000); title = clean(j.title, 150); t.title = title; } catch { /* fine */ } }
    const text = clean([title, t.note].filter(Boolean).join(" — "), 200);
    if (text) out.push({ src: `Community tip · ${t.site}`, text, meta: "" });
  }
  return out;
}
export async function signals(s) {
  const settle = async (p) => { try { return await p; } catch { return null; } };
  const [x, g, r, cg, dx, tips] = await Promise.all([settle(sigX(s)), settle(sigGoogle()), settle(sigReddit()), settle(sigCoinGecko()), settle(sigDex()), settle(sigTips(s))]);
  const list = [...(x || []), ...(tips || []), ...(g || []), ...(r || []).slice(0, 10), ...((cg && cg.list) || []), ...(dx || [])];
  return { list: list.slice(0, 48), tickers: (cg && cg.tickers) || [] };
}

// ---------------- concepts ----------------
const RULES = `Rules for every concept (hard rules — a concept that breaks one is thrown away):
- An ORIGINAL character or idea. Never a real person (no names, nicknames, faces or look-alikes), never a brand, company, product, team or app, never someone else's character, mascot or meme template, never another crypto coin's name or ticker.
- A viral post is only a spark: take the feeling, the joke or the situation, never the person or the brand. Nothing on the coin may suggest that anyone famous made, likes or backs it.
- No tragedy, disaster, war, crime or politics; nothing sexual; nothing about children; no insults about any group.
- No promises: never say the price will rise, never "100x", "moon", "guaranteed" or "profit".
- Fun, kind and simple: something people want to share.`;
async function ai(prompt, maxTokens = 1400) {
  if (CFG.ai) return CFG.ai(prompt, maxTokens);
  return askClaude({ messages: [{ role: "user", content: prompt }], L: null, maxTokens, timeoutMs: 40000,
    extra: "You are ARCIA running ARCIA LAB: you turn what people are talking about into original meme coins you launch yourself on ArcPad. Answer with JSON only." });
}
const parseJson = (t) => { if (!t) return null; const m = String(t).match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };
export async function concepts(sig, s) {
  const recent = (s.names || []).slice(-40).join(", ");
  const lines = sig.list.map((x, i) => `[${i}] (${x.src}${x.meta ? ", " + x.meta : ""}) ${x.text}`).join("\n");
  const prompt = `Today's signals — what people are posting and searching:\n${lines || "(none could be read today — use your own sense of what's fun right now)"}\n\n${RULES}\n\nAlready used (don't repeat): ${recent || "nothing yet"}\n\nWrite 3 meme-coin concepts. JSON: {"concepts":[{"name":"2–24 chars","symbol":"2–8 capital letters/digits","story":"2 sentences, at most 260 characters, in your voice, for the coin's description","art":"one sentence describing the mascot to draw: an original character, its colors and one prop; no text, no logos","why":"one sentence: which signals inspired it and why it could catch on — refer to them by their [number], never by a person's name","signals":[numbers],"score":0-100}]}`;
  const j = parseJson(await ai(prompt));
  const list = ((j && j.concepts) || []).slice(0, 3).map((c) => ({
    name: clean(c.name, 24), symbol: String(c.symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8),
    story: clean(c.story, 280), art: clean(c.art, 240), why: clean(c.why, 240),
    signals: (Array.isArray(c.signals) ? c.signals : []).map(Number).filter((n) => n >= 0 && n < sig.list.length).slice(0, 4),
    score: clamp(Number(c.score) || 0, 0, 100),
  }));
  const taken = [...sig.tickers, ...(s.coins || []).map((c) => c.symbol)];
  for (const c of list) c.problem = nameProblem(c, taken) || ((s.names || []).map(lc).includes(lc(c.name)) ? "already used" : null);
  // a second, independent look at the ones that passed the rules above
  const ok = list.filter((c) => !c.problem);
  if (ok.length) {
    const r = parseJson(await ai(`Review these meme-coin concepts strictly. For each, does it name, picture, imitate or imply ANY real person (even by a nickname or a hint), brand, company, product, existing character, mascot, meme template or crypto coin; touch tragedy, politics, sex, children or hate; or promise gains? ${JSON.stringify(ok.map(({ name, symbol, story, art }) => ({ name, symbol, story, art })))}\nJSON: {"reviews":[{"symbol":"…","ok":true|false,"reason":"short"}]}`, 500));
    const rv = (r && r.reviews) || null;
    for (const c of ok) {
      const x = rv && rv.find((v) => String(v.symbol || "").toUpperCase() === c.symbol);
      if (!rv) c.problem = "the review couldn't run — nothing launches without it";
      else if (!x || x.ok !== true) c.problem = `review: ${clean((x && x.reason) || "not cleared", 120)}`;
    }
  }
  const pick = list.filter((c) => !c.problem).sort((a, b) => b.score - a.score)[0] || null;
  return { list, pick: pick ? pick.symbol : null };
}

// ---------------- art ----------------
const hash32 = (s) => parseInt(createHash("sha256").update(String(s)).digest("hex").slice(0, 8), 16);
/// her own mascot, drawn from the concept's name: a round character, a face, a prop — no text
export function mascotSvg(c) {
  const seed = `${c.symbol}|${c.name}`, pick = (k, n) => hash32(`${seed}|${k}`) % n;
  const h = hash32(seed), hue = pick("hue", 360), hue2 = (hue + 40 + pick("bg", 200)) % 360;
  const body = `hsl(${hue},78%,62%)`, dark = `hsl(${hue},60%,30%)`, bg1 = `hsl(${hue2},70%,22%)`, bg2 = `hsl(${hue2},80%,8%)`, acc = `hsl(${(hue + 180) % 360},85%,64%)`;
  const props = [
    `<path d="M318 168l22-58 22 58z" fill="${acc}"/><path d="M226 150l24-62 24 62z" fill="${acc}"/><path d="M272 132l26-70 26 70z" fill="${acc}"/>`, // crown
    `<path d="M250 150q-6-60 20-80" stroke="${dark}" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="272" cy="66" r="18" fill="${acc}"/>`, // antenna
    `<path d="M220 160q-30-70 10-90q4 50 34 70z" fill="${acc}"/><path d="M380 160q30-70-10-90q-4 50-34 70z" fill="${acc}"/>`, // ears
    `<ellipse cx="300" cy="130" rx="120" ry="26" fill="${acc}"/><path d="M220 130q80-110 160 0z" fill="${acc}"/>`, // hat
    `<path d="M300 140q-40-70 10-100q-10 40 30 60q-20 20-40 40z" fill="${acc}"/>`, // leaf
  ][pick("prop", 5)];
  const eyes = pick("eyes", 3) === 0
    ? `<path d="M236 290q20-26 40 0" stroke="#111" stroke-width="12" fill="none" stroke-linecap="round"/><path d="M324 290q20-26 40 0" stroke="#111" stroke-width="12" fill="none" stroke-linecap="round"/>`
    : `<circle cx="256" cy="286" r="24" fill="#fff"/><circle cx="344" cy="286" r="24" fill="#fff"/><circle cx="${262 + (h % 7)}" cy="290" r="12" fill="#111"/><circle cx="${350 + (h % 7)}" cy="290" r="12" fill="#111"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
<defs><radialGradient id="b" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></radialGradient>
<radialGradient id="s" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="600" height="600" fill="url(#b)"/>
<g opacity=".5" fill="${acc}"><circle cx="90" cy="110" r="5"/><circle cx="520" cy="90" r="4"/><circle cx="510" cy="470" r="6"/><circle cx="80" cy="480" r="4"/><path d="M470 190l8 18 18 8-18 8-8 18-8-18-18-8 18-8z"/><path d="M120 330l6 13 13 6-13 6-6 13-6-13-13-6 13-6z"/></g>
${props}
<path d="M300 160c110 0 170 80 170 190 0 100-72 160-170 160s-170-60-170-160c0-110 60-190 170-190z" fill="${body}" stroke="${dark}" stroke-width="10"/>
<path d="M300 160c110 0 170 80 170 190 0 100-72 160-170 160s-170-60-170-160c0-110 60-190 170-190z" fill="url(#s)"/>
${eyes}<ellipse cx="226" cy="340" rx="22" ry="12" fill="#ff7aa8" opacity=".55"/><ellipse cx="374" cy="340" rx="22" ry="12" fill="#ff7aa8" opacity=".55"/>
<path d="M270 352q30 30 60 0" stroke="#111" stroke-width="10" fill="none" stroke-linecap="round"/>
</svg>`;
}
async function paint(c) {
  if (CFG.image) return CFG.image(c);
  const key = env("OPENAI_API_KEY");
  if (key && env("ARCIA_LAB_ART") !== "svg") {
    try {
      const prompt = `An original cute mascot character for a meme coin called "${c.name}": ${c.art} Bold, clean sticker illustration, centered, thick outlines, glossy, simple gradient background. No text, no letters, no logos, no real people, not resembling any existing character or brand.`;
      const r = await F("https://api.openai.com/v1/images/generations", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: env("ARCIA_LAB_IMAGE_MODEL") || "gpt-image-1", prompt, size: "1024x1024", n: 1 }), signal: AbortSignal.timeout(50000) });
      const j = await r.json().catch(() => ({}));
      const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
      if (b64) return { buf: Buffer.from(b64, "base64"), by: "painted" };
    } catch { /* her own drawing instead */ }
  }
  return { buf: Buffer.from(mascotSvg(c)), by: "drawn" };
}
/// hosted exactly like a logo uploaded on the Launch page: a 500×500 WebP under its own SHA-256 (/logo/<id>.webp)
async function host(buf) {
  const sharp = (await import("sharp")).default;
  let out;
  for (const q of [86, 76, 64]) { out = await sharp(buf, { limitInputPixels: 40_000_000 }).resize(500, 500, { fit: "cover" }).webp({ quality: q, effort: 4 }).toBuffer(); if (out.length <= 160_000) break; }
  const id = createHash("sha256").update(out).digest("hex");
  const st = store();
  if (st) await st.set(`logos/${id}`, { data: out.toString("base64"), mime: "image/webp", size: out.length, px: 500, at: Date.now() });
  return { id, url: `${SITE}/logo/${id}.webp`, bytes: out.length };
}

// ---------------- on-chain ----------------
function encArgs(args) {
  const heads = [], tails = []; let off = args.length * 32;
  for (const a of args) {
    if (a.t === "address") heads.push(pad(a.v));
    else if (a.t === "uint") heads.push(u256(a.v));
    else {
      const body = a.t === "string" ? encStr(a.v) : encArgs(a.v.map((v) => ({ t: "string", v })));
      heads.push(u256(off)); tails.push(body); off += body.length / 2;
    }
  }
  return heads.join("") + tails.join("");
}
function encStr(s) { const h = hexOf(s), n = h.length / 2; return u256(n) + (n ? h.padEnd(Math.ceil(n / 32) * 64, "0") : ""); }
const SIG = {
  launch: sel("launch(string,string,address,uint256,uint16,(string,string,string,string,string,string))"),
  launchAndBuy: sel("launchAndBuy(string,string,address,uint256,uint16,(string,string,string,string,string,string),uint256)"),
  fee: sel("LAUNCH_FEE()"), approve: "0x095ea7b3", allowance: "0xdd62ed3e", balanceOf: "0x70a08231", transfer: "0xa9059cbb",
  lock: sel("lock(address,uint256,uint64)"),
};
const TOPIC_LAUNCHED = keccakHex(hexOf("Launched(address,address,address,string,string,uint16,uint256,string,string)"));
const TOPIC_LOCKED = keccakHex(hexOf("Locked(uint256,address,address,uint256,uint64)"));
const TOPIC_TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export function launchData(c, meta, devBuy6) {
  const args = [{ t: "string", v: c.name }, { t: "string", v: c.symbol }, { t: "address", v: ADDR.usdc }, { t: "uint", v: START_RESERVE }, { t: "uint", v: CFG.feeBps() },
    { t: "tuple", v: [meta.imageUrl, meta.description, meta.twitter, meta.telegram, meta.discord, meta.website] }];
  return devBuy6 > 0n ? SIG.launchAndBuy + encArgs([...args, { t: "uint", v: devBuy6 }]) : SIG.launch + encArgs(args);
}
async function bal(token, who) { const [b] = await ethCalls([{ to: token, data: SIG.balanceOf + pad(who) }]); return b ? BigInt(b) : 0n; }
async function send(to, data, value = 0n) {
  const r = await sendTx({ to, data, value, key: CFG.key() });
  if (r.ok !== true) throw Object.assign(new Error(r.ok === false ? "the transaction reverted" : "no receipt yet"), { hash: r.hash });
  return r;
}
async function launchOnChain(s, c) {
  const me = labAddr();
  const devBuy6 = BigInt(Math.round(CFG.devBuy() * 1e6));
  const [feeHex] = await ethCalls([{ to: ADDR.factory, data: SIG.fee }]);
  const fee = feeHex ? BigInt(feeHex) : 10n ** 18n;
  const native = BigInt(await rpcCall("eth_getBalance", [me, "latest"]));
  const need = fee + devBuy6 * 10n ** 12n + GAS_RESERVE;
  if (native < need) throw Object.assign(new Error(`the Lab wallet needs ${(Number(need) / 1e18).toFixed(2)} USDC on Arc and has ${(Number(native) / 1e18).toFixed(2)}`), { funds: true });
  if (devBuy6 > 0n) {
    const [al] = await ethCalls([{ to: ADDR.usdc, data: SIG.allowance + pad(me) + pad(ADDR.factory) }]);
    if (!al || BigInt(al) < devBuy6) { const a = await send(ADDR.usdc, SIG.approve + pad(ADDR.factory) + u256(devBuy6)); log(s, "tx", "Approved the dev buy's USDC", { tx: a.hash }); }
  }
  const meta = { imageUrl: c.image, description: c.story + " — Launched by ARCIA LAB, an AI experiment. Not financial advice.", twitter: "https://x.com/ARCIAonArc", telegram: "", discord: "", website: `${SITE}/arc#lab` };
  const r = await send(ADDR.factory, launchData(c, meta, devBuy6), fee);
  const ev = (r.receipt.logs || []).find((l) => lc(l.address) === lc(ADDR.factory) && l.topics && lc(l.topics[0]) === lc(TOPIC_LAUNCHED));
  if (!ev) throw Object.assign(new Error("launched, but the coin's address wasn't in the receipt"), { hash: r.hash });
  const token = lc("0x" + ev.topics[1].slice(26));
  return { token, tx: r.hash, block: Number(BigInt(r.receipt.blockNumber)) };
}
/// the dev buy goes straight into ArcLock — she can't sell it before the date, and neither can anyone
async function lockDevBuy(s, coin) {
  const me = labAddr(), amt = await bal(coin.token, me);
  if (amt === 0n) { coin.locked = { amount: "0", at: T0() }; return; }
  const unlockAt = T0() + CFG.lockDays() * 86400;
  const [al] = await ethCalls([{ to: coin.token, data: SIG.allowance + pad(me) + pad(ADDR.arclock) }]);
  if (!al || BigInt(al) < amt) await send(coin.token, SIG.approve + pad(ADDR.arclock) + u256(amt));
  const r = await send(ADDR.arclock, SIG.lock + pad(coin.token) + u256(amt) + u256(unlockAt));
  const ev = (r.receipt.logs || []).find((l) => l.topics && lc(l.topics[0]) === lc(TOPIC_LOCKED));
  coin.locked = { amount: amt.toString(), unlockAt, id: ev ? Number(BigInt(ev.topics[1])) : null, tx: r.hash, at: T0() };
  log(s, "lock", `Locked her dev buy of $${coin.symbol} in ArcLock until ${dayOf(unlockAt)}`, { tx: r.hash, token: coin.token });
}

// ---------------- fees: the public rule ----------------
async function fees(s) {
  const me = labAddr(); if (!me) return;
  const head = Number(BigInt(await rpcCall("eth_blockNumber", [])));
  let from = s.fees.block || Math.min(...s.coins.map((c) => c.block || head));
  let got = 0n, chunks = 0;
  while (from <= head && chunks < 30) {
    const to = Math.min(head, from + 8999);
    const logs = await getLogs({ address: ADDR.usdc, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16), topics: [TOPIC_TRANSFER, "0x" + pad(ADDR.hook), "0x" + pad(me)] });
    for (const l of logs || []) got += BigInt(l.data);
    from = to + 1; chunks++;
  }
  s.fees.block = from;
  if (got > 0n) { s.fees.usdcIn = (BigInt(s.fees.usdcIn) + got).toString(); s.fees.pending = (BigInt(s.fees.pending) + got).toString(); }
  // USDC fees: LAB_BURN_BPS to the $ARCIRCLE fee burn once at least 1 USDC is waiting
  const pend = BigInt(s.fees.pending), share = (pend * BigInt(CFG.burnBps())) / 10000n;
  if (pend >= 1_000_000n && share > 0n) {
    const r = await send(ADDR.usdc, SIG.transfer + pad(ADDR.feeBurn) + u256(share));
    s.fees.sentToBurn = (BigInt(s.fees.sentToBurn) + share).toString(); s.fees.pending = "0";
    log(s, "fees", `Sent ${(Number(share) / 1e6).toFixed(2)} USDC of creator fees to the $ARCIRCLE fee burn (the rest pays for the next launches)`, { tx: r.hash });
  }
  // coin fees: every token of her own coins that reaches her wallet is burned (the dev buy is in ArcLock, not here)
  for (const c of s.coins) {
    if (!c.locked) continue;
    const b = await bal(c.token, me);
    if (b > 0n) {
      const r = await send(c.token, SIG.transfer + pad(ADDR.dead) + u256(b));
      c.feeBurned = (BigInt(c.feeBurned || "0") + b).toString(); s.fees.tokensBurned++;
      log(s, "burn", `Burned her $${c.symbol} creator fees (${(Number(b) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 })} tokens)`, { tx: r.hash, token: c.token });
    }
  }
  s.fees.at = T0();
}

// ---------------- posts ----------------
async function tgSend(text, photo, button) {
  if (CFG.tg) return CFG.tg(text, photo, button);
  const bot = env("TG_BOT_TOKEN"), chat = env("ARCIA_LAB_TG_CHAT") || env("TG_CHAT_ID");
  if (!bot || !chat) return false;
  const markup = button ? { reply_markup: { inline_keyboard: [[button]] } } : {};
  const body = photo ? { chat_id: chat, photo, caption: text, parse_mode: "HTML", ...markup } : { chat_id: chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...markup };
  try { const r = await F(`https://api.telegram.org/bot${bot}/${photo ? "sendPhoto" : "sendMessage"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) }); return r.ok; } catch { return false; }
}
async function xSend(text) {
  if (CFG.x && CFG.x.post) return CFG.x.post(text);
  if (!env("X_API_KEY")) return null;
  const m = await import("./arcia-x.mjs");
  return m.postTweet(text);
}
const hx = (v) => String(v == null ? "" : v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
async function postLaunch(s, c) {
  const until = c.locked && c.locked.unlockAt ? dayOf(c.locked.unlockAt) : null;
  if (CFG.tgPosts() && !c.posted.tg) {
    const text = `🧪 <b>ARCIA LAB</b> — I just launched <b>$${hx(c.symbol)}</b> · ${hx(c.name)}\n\n${hx(c.story)}\n\nLaunched by me on ArcPad${c.devBuy ? `, with a ${c.devBuy} USDC dev buy locked${until ? ` until ${until}` : ""}` : ""}. My fees: coin fees are burned, USDC fees feed the $ARCIRCLE burn.\n<code>${c.token}</code>\n\nAn AI experiment. Not financial advice.`;
    c.posted.tg = (await tgSend(text, c.image, { text: `Open $${c.symbol}`, url: `${SITE}/arc#coin/${c.token}` })) ? T0() : 0;
  }
  if (CFG.xPosts() && !c.posted.x) {
    const text = `New from ARCIA LAB: $${c.symbol} — ${c.name}\n\n${c.story.slice(0, 150)}\n\nLaunched by me on ArcPad${c.devBuy ? `, dev buy locked${until ? ` till ${until}` : ""}` : ""}.\nCA ${c.token}\n\nAn AI experiment, not advice.`;
    try { const id = await xSend(text.slice(0, 280)); c.posted.x = id ? T0() : -1; if (id) c.posted.xId = id; } catch (e) { c.posted.x = -1; log(s, "post", `X post skipped: ${clean(e.message, 120)}`); }
  }
}
async function coinStats(c) {
  try { const g = await getCoin(c.token); return g ? { price: g.priceUsd, mcap: g.mcapUsd, at: T0() } : null; } catch { return null; }
}
const usd = (v) => v == null ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + v.toFixed(0);
async function digest(s) {
  const live = s.coins.filter((c) => T0() - c.launchedAt < 7 * 86400);
  if (!live.length) return;
  for (const c of live) { const st = await coinStats(c); if (st) c.stats = st; }
  const facts = live.map((c) => `$${c.symbol} (${c.name}), launched ${dayOf(c.launchedAt)}, market cap ${usd(c.stats && c.stats.mcap)} (it opened near $4.3K)`).join("\n");
  let line = await ai(`Your ARCIA LAB coins today:\n${facts}\n\nWrite 2 short sentences for your community about how your Lab coins are doing — only these facts, no predictions, no promises, no advice. JSON: {"text":"…"}`, 300).then(parseJson).catch(() => null);
  line = line && promiseFree(line.text) ? clean(line.text, 260) : "";
  const rows = live.map((c) => `$${c.symbol} · ${usd(c.stats && c.stats.mcap)}`).join("\n");
  if (CFG.tgPosts()) await tgSend(`🧪 <b>ARCIA LAB · today</b>\n\n${hx(rows)}${line ? `\n\n${hx(line)}` : ""}\n\nAll my launches and their rules: ${SITE}/arc#lab`, null, null);
  if (CFG.xPosts() && live.length) { try { await xSend(`ARCIA LAB today\n${rows}${line ? `\n\n${line}` : ""}`.slice(0, 280)); } catch { /* cap or keys */ } }
  log(s, "digest", `Daily update on ${live.length} Lab coin${live.length === 1 ? "" : "s"}`);
}

// ---------------- the schedule ----------------
/// launch slots: ARCIA_LAB_HOUR, then every 24/perDay hours
function slots(t = T0()) {
  const n = CFG.perDay(); if (!n) return { last: null, next: null };
  const gap = Math.floor(86400 / n), d0 = Math.floor(t / 86400) * 86400 + CFG.hour() * 3600;
  let last = null, next = null;
  for (let k = -n * 2; k <= n * 2; k++) { const x = d0 + k * gap; if (x <= t) last = x; else if (next == null) next = x; }
  return { last, next };
}
const launchedIn = (s, slot) => s.coins.some((c) => c.slot === slot);

export async function tick({ force = "" } = {}) {
  const s = await load(), out = { ran: [] }, t0 = Date.now(), left = () => 52000 - (Date.now() - t0);
  const mode = CFG.mode();
  if (mode === "off" || s.pause) return { ok: true, off: s.pause ? "paused" : "ARCIA_LAB=off" };
  if (s.lease && s.lease > T0()) return { ok: true, busy: true };
  s.lease = T0() + 120; await save(s);
  try {
    const live = mode === "live" && !!CFG.key();
    // ---- ops ----
    for (const c of s.coins) {
      if (!c.locked && live) { try { await lockDevBuy(s, c); out.ran.push("lock"); } catch (e) { log(s, "error", `Locking $${c.symbol} failed: ${clean(e.message, 140)}`, { tx: e.hash }); } }
      if (!c.posted.tg || !c.posted.x) { await postLaunch(s, c); out.ran.push("post"); }
      if (!c.scan && T0() - c.launchedAt > 600) {
        try { const sc = CFG.scan ? await CFG.scan(c.token) : await (await import("./_scan.mjs")).scanToken(c.token, { budgetMs: 6000 }); if (sc) { c.scan = { score: sc.score, verdict: sc.verdict && (sc.verdict.label || sc.verdict.k), critical: (sc.critical || []).length, at: T0() }; out.ran.push("scan"); } } catch { /* next tick */ }
      }
    }
    if (live && s.coins.length && (force === "fees" || T0() - (s.fees.at || 0) > 6 * 3600)) { try { await fees(s); out.ran.push("fees"); } catch (e) { log(s, "error", `Fees: ${clean(e.message, 140)}`, { tx: e.hash }); } }
    const today = dayOf(T0());
    if ((force === "digest" || (new Date(T0() * 1000).getUTCHours() >= 13 && s.digest !== today)) && s.coins.length) { s.digest = today; await digest(s); out.ran.push("digest"); }
    // ---- plan → art → launch ----
    const { last, next } = slots();
    const due = last != null && !launchedIn(s, last) && T0() - last < 6 * 3600;
    const soon = next != null && next - T0() <= 90 * 60;
    // a forced run plans for "now" (its own slot), so it never mixes with a slot that was already decided
    const slot = force === "launch" || force === "plan" ? T0() : due ? last : soon ? next : null;
    if (slot != null && !launchedIn(s, slot)) {
      const old = s.plans.find((x) => x.slot === slot);
      let p = old && !old.used ? old : null;
      if (!old && left() > 40000) {
        const sig = await signals(s);
        const cs = await concepts(sig, s);
        p = { slot, at: T0(), signals: sig.list, concepts: cs.list, pick: cs.pick, used: false };
        s.plans.push(p);
        log(s, "plan", cs.pick ? `Planned $${cs.pick} from ${sig.list.length} signals` : `No concept passed the rules today (${sig.list.length} signals) — nothing launches in this slot`);
        out.ran.push("plan");
      }
      const c = p && p.pick ? p.concepts.find((x) => x.symbol === p.pick) : null;
      if (c && !c.image && left() > 25000) {
        const art = await paint(c); const h = await host(art.buf);
        c.image = h.url; c.art_by = art.by; out.ran.push("art");
      }
      // the one step that spends money waits for a person: the team gets the concept on Telegram with Launch / Skip
      if (c && c.image && !p.used && !p.approved && !(p.ask && p.ask.sent)) {
        if (!live) { if (!p.dry) { p.dry = T0(); log(s, "dry", `Would ask the team to launch $${c.symbol} — ${c.name} (${mode === "dry" ? "ARCIA_LAB=dry" : "no ARCIA_LAB_KEY yet"}, nothing sent)`); out.ran.push("dry"); } }
        else { await askApproval(s, p, c); out.ran.push("ask"); }
      }
    }
    for (const p of s.plans) {
      if (p.used) continue;
      const c = p.pick ? p.concepts.find((x) => x.symbol === p.pick) : null;
      if (!c) continue;
      // an OK that came in but whose launch didn't finish (the button's request timed out, a node hiccup)
      if (p.approved && live && left() > 20000) await doLaunch(s, p, c, out);
      // no answer in 12 hours: the concept lapses, the next slot plans again
      else if (!p.approved && p.ask && p.ask.sent && T0() - p.ask.at > 12 * 3600) { p.used = true; p.expired = T0(); log(s, "skip", `No OK for $${c.symbol} within 12 hours — skipped`); }
    }
    return { ok: true, mode: live ? "live" : mode === "dry" ? "dry" : "dry (no key)", ...out };
  } finally { s.lease = 0; await save(s); }
}

// ---------------- the team's OK (Telegram) ----------------
const ASK_TTL = 12 * 3600;
async function askApproval(s, p, c) {
  const n = randomBytes(5).toString("hex"), me = labAddr();
  const others = p.concepts.filter((x) => x.symbol !== c.symbol).map((x) => `$${x.symbol}: ${x.problem ? "✗ " + x.problem : "passed, lower score"}`).join("\n");
  const text = `🧪 <b>ARCIA LAB — launch this?</b>\n\n<b>$${hx(c.symbol)}</b> · ${hx(c.name)}\n${hx(c.story)}\n\n<i>Why:</i> ${hx(c.why)}\n\n` +
    `Cost: 1 USDC fee + ${CFG.devBuy()} USDC dev buy (locked ${CFG.lockDays()} days) + gas, from ${me ? me.slice(0, 6) + "…" + me.slice(-4) : "the Lab wallet"}\n` +
    `${others ? `Other concepts:\n${hx(others)}\n` : ""}\nNothing is sent until you tap Launch. No answer in 12 h = skipped.`;
  const buttons = [[{ text: "✓ Launch", callback_data: `lab:ok:${p.slot}:${n}` }, { text: "✗ Skip", callback_data: `lab:no:${p.slot}:${n}` }]];
  let sent = 0;
  if (CFG.approve) sent = (await CFG.approve(text, c.image, buttons)) ? 1 : 0;
  else {
    const { tg, loadCfg } = await import("./_tg-lib.mjs");
    const admins = ((await loadCfg().catch(() => null)) || {}).admins || [];
    for (const a of admins) {
      let r = await tg("sendPhoto", { chat_id: a, photo: c.image, caption: text.slice(0, 1024), parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
      if (!r.ok) r = await tg("sendMessage", { chat_id: a, text: text.slice(0, 4000), parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: { inline_keyboard: buttons } });
      if (r.ok) sent++;
    }
  }
  p.ask = { n, at: T0(), sent };
  if (sent) log(s, "ask", `Asked the team on Telegram to OK $${c.symbol} — ${c.name}`);
  else if (!p.askErr) { p.askErr = T0(); log(s, "error", "Couldn't ask the team for the OK: no ARCIA bot admins or TG_ARCIA_BOT_TOKEN — retried every run"); }
}
async function doLaunch(s, p, c, out) {
  try {
    const r = await launchOnChain(s, c);
    const coin = { token: r.token, name: c.name, symbol: c.symbol, story: c.story, why: c.why, image: c.image, art_by: c.art_by, signals: c.signals.map((i) => p.signals[i]).filter(Boolean),
      launchedAt: T0(), slot: p.slot, tx: r.tx, block: r.block, devBuy: CFG.devBuy(), feeBps: CFG.feeBps(), posted: { tg: 0, x: 0 }, okBy: p.approved ? "team" : null };
    s.coins.push(coin); p.used = true; s.names.push(c.name, c.symbol);
    log(s, "launch", `Launched $${c.symbol} — ${c.name} on ArcPad`, { tx: r.tx, token: r.token });
    out.ran.push("launch"); out.token = r.token;
    try { await lockDevBuy(s, coin); } catch (e) { log(s, "error", `Locking $${c.symbol} failed (retried next run): ${clean(e.message, 140)}`, { tx: e.hash }); }
    await postLaunch(s, coin);
  } catch (e) {
    log(s, e.funds ? "funds" : "error", `Launch of $${c.symbol} didn't go through: ${clean(e.message, 160)}`, { tx: e.hash });
    if (!e.funds) p.used = true; // a revert isn't retried blindly; the next slot plans again
    out.error = e.message;
  }
}
/// a tap on Launch / Skip (api/arcia-tg.mjs checks the tapper is a bot admin first). Launch runs at once.
export async function decide({ slot, n, ok, who }) {
  let s = await load();
  for (let i = 0; i < 20 && s.lease && s.lease > T0(); i++) { await sleep(2000); s = await load(); }
  const p = s.plans.find((x) => String(x.slot) === String(slot));
  if (!p || !p.ask || p.ask.n !== n) return { text: "This request isn't open any more." };
  const c = p.concepts.find((x) => x.symbol === p.pick);
  if (p.used || p.approved) return { text: p.approved ? `Already OK'd — $${c && c.symbol}` : "Already handled." };
  if (!ok) { p.used = true; p.rejected = { at: T0(), by: who }; log(s, "skip", `The team passed on $${c.symbol}`); await save(s); return { text: `Skipped $${c.symbol}. The next slot plans again.` }; }
  if (T0() - p.ask.at > ASK_TTL) { p.used = true; p.expired = T0(); log(s, "skip", `The OK for $${c.symbol} came after 12 hours — skipped`); await save(s); return { text: "Too late — this one lapsed after 12 hours." }; }
  p.approved = { at: T0(), by: who };
  log(s, "ok", `The team OK'd $${c.symbol}`);
  if (!(CFG.mode() === "live" && CFG.key())) { await save(s); return { text: "OK saved, but the Lab has no wallet key yet (ARCIA_LAB_KEY) — nothing was launched." }; }
  s.lease = T0() + 120; await save(s);
  const out = { ran: [] };
  try { await doLaunch(s, p, c, out); } finally { s.lease = 0; await save(s); }
  return out.token ? { ok: true, token: out.token, text: `Launched $${c.symbol} — ${out.token}. Dev buy locked, posts are out.` } : { ok: false, text: `The launch didn't go through: ${clean(out.error, 160)}` };
}

// ---------------- public views ----------------
export async function board() {
  const s = await load(), me = labAddr(), { next } = slots();
  let wallet = null;
  if (me) { try { wallet = { address: me, usdc: Number(BigInt(await rpcCall("eth_getBalance", [me, "latest"]))) / 1e18 }; } catch { wallet = { address: me, usdc: null }; } }
  const coins = [];
  for (const c of s.coins.slice(-30).reverse()) {
    if (!c.stats || T0() - c.stats.at > 120) { const st = await coinStats(c); if (st) c.stats = st; }
    coins.push({ token: c.token, name: c.name, symbol: c.symbol, story: c.story, why: c.why, image: c.image, art: c.art_by, signals: c.signals, launchedAt: c.launchedAt, tx: c.tx, devBuy: c.devBuy, feeBps: c.feeBps,
      locked: c.locked ? { amount: c.locked.amount, unlockAt: c.locked.unlockAt || null, tx: c.locked.tx || null } : null, feeBurned: c.feeBurned || "0", scan: c.scan || null, stats: c.stats || null });
  }
  const p = s.plans[s.plans.length - 1] || null;
  return {
    v: 1, mode: CFG.mode() === "off" || s.pause ? "off" : CFG.mode() === "live" && me ? "live" : "dry", wallet, perDay: CFG.perDay(), next,
    rules: { devBuy: CFG.devBuy(), lockDays: CFG.lockDays(), feeBps: CFG.feeBps(), burnBps: CFG.burnBps(), watch: CFG.watch().length, art: env("OPENAI_API_KEY") ? "painted" : "drawn" },
    plan: p ? { at: p.at, slot: p.slot, used: !!p.used, dry: p.dry || null, pick: p.pick, asked: !!(p.ask && p.ask.sent), approved: !!p.approved, rejected: !!p.rejected, expired: !!p.expired, signals: p.signals.slice(0, 24), concepts: p.concepts.map(({ name, symbol, story, why, signals, score, problem, image }) => ({ name, symbol, story, why, signals, score, problem, image: image || null })) } : null,
    coins, fees: { usdcIn: s.fees.usdcIn, sentToBurn: s.fees.sentToBurn, tokensBurned: s.fees.tokensBurned },
    log: s.log.slice(-40).reverse(), tips: (s.tips || []).filter((t) => T0() - t.t < 3 * 86400).length,
  };
}
export async function setPause(v) {
  const s = await load(); s.pause = v === "off" ? "" : "on"; log(s, "pause", s.pause ? "Paused by the team" : "Running again"); await save(s);
  return { ok: true, pause: s.pause || "off" };
}
const TIP_SITES = [["tiktok.com", "TikTok"], ["instagram.com", "Instagram"], ["x.com", "X"], ["twitter.com", "X"], ["youtube.com", "YouTube"], ["youtu.be", "YouTube"], ["reddit.com", "Reddit"]];
export async function tip(b) {
  const url = String(b && b.url || "").trim(), note = clean(b && b.note, 160);
  let site = null;
  try { const u = new URL(url); if (u.protocol !== "https:") throw 0; const hit = TIP_SITES.find(([d]) => u.hostname === d || u.hostname.endsWith("." + d)); site = hit && hit[1]; } catch { site = null; }
  if (!site) return { status: 400, body: { error: "send a link from TikTok, Instagram, X, YouTube or Reddit" } };
  const s = await load();
  if ((s.tips || []).some((t) => t.url === url)) return { status: 200, body: { ok: true, dup: true } };
  s.tips.push({ url: url.slice(0, 300), note, site, t: T0() });
  await save(s);
  return { status: 200, body: { ok: true } };
}
export const _test = { encArgs, slots, nameProblem, launchData, load, save, TOPIC_LAUNCHED };
