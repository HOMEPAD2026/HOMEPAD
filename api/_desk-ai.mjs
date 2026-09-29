// api/_desk-ai.mjs — ARCIA DESK's second opinion from Claude (Anthropic API, ANTHROPIC_API_KEY).
// Used only where it's worth the time and cost:
//   review()      before a REAL buy that already passed every rule: Claude can say no (it can never
//                 make the desk buy something the rules refused, and never changes size or limits)
//   postMortem()  after a real trade that lost badly: what went wrong, in a few lines, for the page and
//                 the journal
// Model: ARCIA_DESK_MODEL (default claude-opus-5-5), then claude-opus-5 if that one isn't available.
// Everything here fails soft: no key, a timeout or an odd answer → the rules decide on their own.
const env = (k) => String((typeof process !== "undefined" && process.env && process.env[k]) || "").trim();
export const aiEnabled = () => !!env("ANTHROPIC_API_KEY") && env("ARCIA_DESK_AI") !== "0";
const models = () => [...new Set([env("ARCIA_DESK_MODEL") || "claude-opus-5-5", "claude-opus-5"])];
let badModel = null; // a model the API refused this instance, skipped next time

async function callModel({ system, user, maxTokens = 400, timeoutMs = 18000, fetchImpl = fetch }) {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) return null;
  const ws = env("ANTHROPIC_WORKSPACE_ID");
  for (const model of models().filter((m) => m !== badModel)) {
    for (const withWs of ws ? [true, false] : [false]) {
      const headers = { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
      if (withWs) headers["anthropic-workspace-id"] = ws;
      try {
        const r = await fetchImpl("https://api.anthropic.com/v1/messages", {
          method: "POST", headers, signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
        });
        if (r.ok) {
          const j = await r.json();
          const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
          return text ? { text, model } : null;
        }
        const err = (await r.text().catch(() => "")).slice(0, 300);
        if (withWs && /workspace/i.test(err)) continue;
        if (r.status === 404 || /model/i.test(err)) { badModel = model; break; } // try the next model
        return null;
      } catch { return null; } // timeout / network: the rules decide
    }
  }
  return null;
}
const jsonIn = (t) => { try { const m = String(t).match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch { return null; } };

const REVIEW_SYSTEM = `You are the risk desk of ARCIA DESK, a small automated trading desk on Circle's Arc chain that buys
brand-new memecoins launched on Argus (Uniswap v4 pools paired with USDC) and sells them minutes to hours later.
Every setup you see has already passed hard rules (Token Scanner v3 checks, liquidity, round-trip cost, taxes,
holder concentration). Your only job: veto trades that are likely to be dumped on right after entry.
Key facts: an Argus pool starts at its launch price (the floor); the market cap above the floor is mostly early
buyers' money, so if they sell together the price falls back to the floor within a block. Recent losses came from
buying tokens 9–20× above the floor that were dumped to the floor within a minute. Late entries into vertical
pumps, sniper/linked-wallet clusters, sells accelerating against buys, and tiny real depth are red flags.
Be decisive and brief. Answer ONLY with JSON: {"go": true|false, "confidence": 0-1, "reason": "one short sentence"}.`;

/// → { go, confidence, reason, model } or null (no key / failed → the rules decide)
export async function review(setup, opts = {}) {
  if (!aiEnabled()) return null;
  const r = await callModel({ system: REVIEW_SYSTEM, user: `Setup to review (numbers are live):\n${JSON.stringify(setup)}`, maxTokens: 200, timeoutMs: opts.timeoutMs || 18000, fetchImpl: opts.fetchImpl });
  if (!r) return null;
  const j = jsonIn(r.text);
  if (!j || typeof j.go !== "boolean") return null;
  return { go: j.go, confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)), reason: String(j.reason || "").slice(0, 200), model: r.model };
}

const PM_SYSTEM = `You review closed trades for ARCIA DESK (an automated desk trading brand-new Argus launches on Arc with a small
wallet). Given one losing trade with its entry features, scanner summary and price path, explain in at most 3 short
plain-English sentences what most likely went wrong and which signal would have warned. No hype, no advice to anyone.`;
export async function postMortem(trade, opts = {}) {
  if (!aiEnabled()) return null;
  const r = await callModel({ system: PM_SYSTEM, user: JSON.stringify(trade), maxTokens: 220, timeoutMs: opts.timeoutMs || 18000, fetchImpl: opts.fetchImpl });
  return r ? { text: r.text.slice(0, 600), model: r.model } : null;
}
export const _test = { reset: () => { badModel = null; } };
