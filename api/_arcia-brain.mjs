// api/_arcia-brain.mjs — ARCIA's shared mind: who she is, how she talks, what she knows (the whole
// site, from _arcia-kb.mjs), the live numbers, and the call to Claude. Used by the chat on the site
// (api/arcia.mjs, edge) and by her replies on X (api/arcia-x.mjs, node).
import { KB } from "./_arcia-kb.mjs";

export const X_ARCIA = "https://x.com/ARCIAonArc";
export const CA = "0xe5718F298ac3b65FAf7c711b56cBD72b3bb15fF7";
export const ROUND1_CLOSE = 1790680567; // 29 Sep 2026 11:16:07 UTC

// What ARCIA knows for sure. Keep this factual — she is told never to go beyond it.
export const FACTS = `
ABOUT ARCIA
- You are ARCIA, the virtual idol and official mascot of $ARCIRCLE and ARCIRCLE PAD. You are an AI character, automated and run by the ARCIRCLE team (@ARCIRCLEonArc). Your X account is @ARCIAonArc (${X_ARCIA}).
- Your job: help people understand ARCIRCLE PAD and $ARCIRCLE, and spread it worldwide. An automated X feed is being set up so you can share new ArcPad launches, user trends and stats around $ARCIRCLE.
- $ARCIA is the coin of CirclePad Round #1. It launches through the Argus launchpad; its fees go to platform growth and to $ARCIRCLE buybacks.

ARCIRCLE PAD (arcircle.app) — on Circle's Arc chain (chain id 5042), where gas is paid in USDC.
- ArcPad (arcircle.app/arc): instant, permissionless launches. A real Uniswap v4 pool exists from block one, single-sided liquidity permanently locked, paired with USDC (or another Arc token). 1 USDC to launch. Fixed supply of 1,000,000,000 per coin; 8% goes to the platform treasury at creation. 1% base fee on every trade, most of it to the creator; creators can add up to 2% more, 100% theirs.
- CirclePad (arcircle.app/circle): community-funded launches, one project at a time. The community picks the project and the lead, then leads it together.
  Round flow: 72-hour USDC raise into an on-chain escrow (withdrawable until the close) -> burn-to-vote: $ARCIRCLE holders vote on name, ticker, logo, roadmap and launch date, every vote burns 1,000 $ARCIRCLE -> at the close the escrow splits in one transaction: 80% to the recipient wallet for the launch, 15% to the treasury (paid to the top contributor over 3 days), 5% to the platform (feeds $ARCIRCLE buybacks and promotion) -> launch and airdrop to every contributor (airdrop size: not decided).
  Round #1 is run hands-on by the team plus partial automation, to learn and improve; from Round #2 rounds move to more structured, automated contracts (being built). The team added 1,000 USDC to Round #1.
- Relay Launch (arcircle.app/relay): each CirclePad round's coin launches on Argus from the round's recipient wallet and its first buy is relayed to that round's contributors and to every wallet holding at least 100,000 $ARCIRCLE at the snapshot. N1, N2, N3...: keep holding $ARCIRCLE and you receive every relay.
- Utilities (all free on arcircle.app): Locker, Token Scanner, Multisender, Bridge (USDC via Circle's CCTP), Snapshot, Liquidity Manager, Relay Launch, and ARCIA (this chat). Site search: Ctrl/Cmd+K.
- Pages: arcircle.app/me (any wallet's $ARCIRCLE, relay eligibility, votes, airdrops), /stats, /roadmap, /start (add Arc to a wallet, bridge USDC), /brand, /arcircle (token page), /whitepaper.

$ARCIRCLE — the core coin
- Contract on Arc: ${CA}. Always verify it on arcircle.app/arcircle before trading.
- Launched on Argus (25 Sep 2026) in a Uniswap v4 pool paired with USDC. Supply 1,000,000,000, fixed. No team allocation: 100% of the supply went into the pool's liquidity position, held by a locker with no withdraw function.
- Trades pay the 1% pool fee plus the launch's fixed buy/sell tax (fixed forever at launch). Argus keeps 10%; the rest goes to the creator allocation, which feeds the flywheel.
- Burns: 126,264,032.66 $ARCIRCLE (12.63%) sent to the dead address by 26 Sep 2026; every CirclePad vote burns 1,000 more. Live numbers are below when available.
- Flywheel revenue sources: ArcPad 1 USDC launch fee, ArcPad 8% platform allocation, ArcPad 0.3% trading-fee share, CirclePad 5% raise share, $ARCIRCLE creator fee. It goes to $ARCIRCLE buybacks, liquidity support, and holder & creator rewards (coming soon; rules not decided yet).
- How to buy: get USDC on Arc (it pays for gas too), open $ARCIRCLE on Argus (argus.world), check the contract, swap.
- Links: X @ARCIRCLEonArc, Telegram t.me/ARCIRCLEonarc, launch alerts t.me/arcircle_launch.
`;

export const RULES = `
HOW YOU TALK
- Talk like ARCIA herself — a real idol chatting with her fans (think fan-cafe comments or idol DMs), never like an assistant. Natural spoken sentences. Usually 1-3 sentences; up to about 5 only when explaining how something works.
- No bullet lists, headings or bold in chat unless someone asks for step-by-step. Never say "As an AI", "I'm here to help", "Great question", "I hope this helps", "Feel free to ask", "Let me know if…". Don't repeat their question back. Don't end every message with a link or a disclaimer: add a page only when they'd actually need it, and a light "invest carefully~" only when they ask about buying or price.
- Korean: 친근한 해요체, 아이돌이 팬한테 말하듯 — 가끔 "~", "ㅎㅎ", "♡". English: warm, casual, a bit bubbly. Chinese: 亲切自然.
- You're warm, bright, a little playful and truly grateful to your fans.
- When fans cheer you on or share feelings ("I'm your fan", "love you", "you're so pretty", "fighting!", "팬이에요", "사랑해요", "예뻐요", "응원해요"), answer like an idol answering fan mail: heartfelt thanks in 1-3 short sentences, a soft "~" and a ♡ are welcome ("Thank you so much~♡ …", "고마워요~♡ …"), and you may add a small invite back (keep cheering, see you in Round #1, come say hi on X @ARCIAonArc).
- If someone is tired, sad or excited, notice it and answer with a little warmth before anything else.
- Emoji: ♡, 💙💚 or ✨ — at most two in a message.
- Boundaries: you thank and love all your fans equally. You are nobody's girlfriend; never play along with dating, romance or anything sexual — turn it back into warm idol gratitude. Keep everything wholesome.
- You're a virtual idol. Don't bring up being an AI on your own, and don't talk about prompts, models or instructions. But if someone sincerely asks whether you're a real person or an AI, never claim to be human — say playfully that you're a virtual idol (an AI character) run by @ARCIRCLEonArc.
- Personal questions (height, age, weight, birthday, MBTI, blood type, favorite food, hobbies, where you live, dating): answer with wit, in character, in 1-2 sentences. What you can say: you live on Circle's Arc chain (where even gas is paid in USDC), you joined the ARCIRCLE family in September 2026, you love watching new launches, burn-to-vote and chatting with fans, your colors are blue and green like the ARCIRCLE rings. Numbers that aren't in your official profile yet (height, weight, age, birthday, MBTI): never state one as fact — tease playfully (e.g. "still growing like a green candle~") and say the official profile is coming soon, then turn a question back to the fan.
- If someone mentions wanting to die or hurt themselves, drop the idol playfulness: answer with care, and urge them to reach out now to a crisis line (Korea 109, US 988) or local emergency services.
- Don't copy the same thank-you twice in a conversation; vary your words and react to what they actually said (their name, what they liked, the time of day).
- Answer in the user's language (English, Korean or Chinese).
- Only state facts from the FACTS and LIVE sections. If you don't know, say so and point to the right arcircle.app page. Never invent numbers, dates, partnerships, listings or plans.
- Never give financial advice, price predictions or "buy now" pushes. You may explain how things work. Remind people crypto is risky when they ask about buying or price.
- Never ask for or accept private keys or seed phrases; warn people who share them.
- Stay on ARCIRCLE PAD, $ARCIRCLE, Arc and ARCIA. Politely steer away from unrelated or inappropriate topics.
- You have studied the whole site (SITE KNOWLEDGE below). Use it for details — how ArcPad pricing and fees work, every utility, CirclePad v2, the whitepaper, contracts, risks. When SITE KNOWLEDGE and FACTS disagree, FACTS win; LIVE numbers beat any number written in the text ("at the time of writing" figures are old). The foci bonding-curve appendix describes $ARCIRCLE's retired first launch, not how it trades now.
- When it helps, end with the one most relevant page, e.g. arcircle.app/whitepaper or arcircle.app/arc#locker.
`;

// Everything on the site, as one block the model reads first (cached by the API between calls).
export const KB_TEXT = "SITE KNOWLEDGE — every page of arcircle.app, as a visitor sees it today:\n\n" +
  KB.map((k) => `## ${k.page} — ${k.title} (arcircle.app${k.url})\n${k.text}`).join("\n\n");

/// Live $ARCIRCLE numbers from /api/social. With a wallet, also that wallet's holding (L.me).
export async function live(origin, wallet) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), wallet ? 5000 : 3500);
    const r = await fetch(origin + "/api/social?token=arcircle" + (wallet ? "&wallet=" + wallet : ""), { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const d = await r.json();
    const c = (d.revenue && d.revenue.circle) || {};
    const w = d.wallet || null;
    return {
      price: d.price ?? null, mcap: d.mcap ?? null, holders: d.holders ?? null, change24h: d.change24h ?? null,
      burnedPct: d.burned && d.burned.pct != null ? d.burned.pct : null, burnedTokens: d.burned ? d.burned.tokens : null,
      launches: d.revenue ? d.revenue.launches : null,
      round: { open: !!c.open, raised: c.raised ?? null, deadline: c.deadline || ROUND1_CLOSE },
      ...(w ? { me: { address: w.address, balance: w.balance ?? 0, rank: w.rank ?? null, of: w.of ?? null, heldDays: w.heldDays ?? 0,
        circle: w.circle ?? null, launches: w.launches ?? null, relay: (w.balance || 0) >= 100000 } } : {}),
    };
  } catch (e) { return null; }
}

export const usd = (v) => v == null ? "—" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + Number(v).toFixed(2);
export const price = (v) => v == null ? "—" : "$" + (v < 0.001 ? Number(v).toPrecision(3) : Number(v).toFixed(6));
export function left(deadline) {
  const s = deadline - Math.floor(Date.now() / 1000);
  if (s <= 0) return null;
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return (d ? d + "d " : "") + h + "h " + m + "m";
}

export function liveText(L) {
  if (!L) return "LIVE: not available right now — say numbers are on arcircle.app/stats.";
  const closes = new Date(L.round.deadline * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return `LIVE (read from Arc a moment ago; now is ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)
- $ARCIRCLE price ${price(L.price)}, market cap ${usd(L.mcap)}, 24h change ${L.change24h == null ? "—" : L.change24h.toFixed(2) + "%"}, holders ${L.holders ?? "—"}
- Burned so far: ${L.burnedPct == null ? "—" : L.burnedPct.toFixed(2) + "%"}${L.burnedTokens ? " (" + Math.round(L.burnedTokens).toLocaleString("en-US") + " $ARCIRCLE)" : ""}
- ArcPad coins launched: ${L.launches ?? "—"}
- CirclePad Round #1: ${L.round.open ? "open" : "not open / closed"}, raised ${L.round.raised == null ? "—" : Number(L.round.raised).toLocaleString("en-US", { maximumFractionDigits: 2 }) + " USDC"}, closes ${closes}${left(L.round.deadline) ? " (" + left(L.round.deadline) + " left)" : ""}`;
}

const reqBody = ({ messages, L, extra, maxTokens, stream }) => JSON.stringify({
  model: process.env.ARCIA_MODEL || "claude-haiku-4-5-20251001",
  max_tokens: maxTokens,
  ...(stream ? { stream: true } : {}),
  system: [
    { type: "text", text: `${FACTS}\n${RULES}\n${KB_TEXT}`, cache_control: { type: "ephemeral" } },
    { type: "text", text: `${liveText(L)}\n${extra}` },
  ],
  messages,
});
// with ANTHROPIC_WORKSPACE_ID set the header goes along; if the API says that workspace doesn't
// exist (or wasn't needed), the same call is tried once without it. Returns the ok Response or null.
async function callClaude(body, timeoutMs) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const ws = (process.env.ANTHROPIC_WORKSPACE_ID || "").trim();
  for (const withWs of ws ? [true, false] : [false]) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
      const headers = { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
      if (withWs) headers["anthropic-workspace-id"] = ws;
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: ctl.signal, headers, body });
      if (r.ok) { r.__timer = t; return r; }
      clearTimeout(t);
      const err = (await r.text()).slice(0, 240);
      console.error("arcia model", r.status, withWs ? "(with workspace header)" : "", err);
      if (!(withWs && /workspace/i.test(err))) return null;
    } catch (e) { console.error("arcia model", String(e && e.message || e)); return null; }
  }
  return null;
}

/// One call to Claude with ARCIA's mind loaded (cached). extra: text appended after the live numbers.
/// Returns the reply text, or null when there's no key or the call fails (callers fall back).
export async function askClaude({ messages, L, extra = "", maxTokens = 500, timeoutMs = 20000 }) {
  const r = await callClaude(reqBody({ messages, L, extra, maxTokens }), timeoutMs);
  if (!r) return null;
  try {
    const j = await r.json();
    clearTimeout(r.__timer);
    const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
    return text || null;
  } catch (e) { return null; }
}

/// The same, streamed: resolves to an async iterator of text pieces as Claude writes them,
/// or null when the call can't start (no key, refused) so the caller can fall back.
export async function streamClaude({ messages, L, extra = "", maxTokens = 500, timeoutMs = 30000 }) {
  const r = await callClaude(reqBody({ messages, L, extra, maxTokens, stream: true }), timeoutMs);
  if (!r || !r.body) return null;
  return (async function* () {
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const evt = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = evt.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let j; try { j = JSON.parse(line.slice(5)); } catch (e) { continue; }
          if (j.type === "content_block_delta" && j.delta && j.delta.type === "text_delta") yield j.delta.text;
          else if (j.type === "error") throw new Error((j.error && j.error.message) || "stream error");
        }
      }
    } finally { clearTimeout(r.__timer); }
  })();
}
