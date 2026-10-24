// api/_world-agarena.mjs — the Agent Arena (AD-City 4, the owner's "응 다 진행하자" 2026-10-24): quiz duels in Nexus City's
// arena. You and your agent answer 7 questions (crypto safety, Arc and ARCIRCLE World), 15 s each; once a run the agent
// helps (50 : 50, a wrong answer taken away). The server deals the questions without their answers and marks them at the
// end, its own clock for the time. Points go on the week's board; the arena hour (ARENA.HOURS, Seoul time) counts them
// twice. No ARCL is paid here (the board, the title of the week's best and the agent's pride only).
// Behind AGENT DIMENSION's door (GM wallets while it's closed: shut), and you need an agent.
//
//   POST { action: "world-agarena-start", …signature }              → { qs: [{ q, opts }], secs, hour, left }
//   POST { action: "world-agarena-help",  …signature, q }           → { cut }          (one wrong option of question q, once a run)
//   POST { action: "world-agarena-end",   …signature, picks, ms }   → { right, correct, pts, hour, perfect, week: { pts, rank } }
//   GET  ?world=agarena-top                                         → { week, top: [{ name, agent, kind, pts, runs }], hours }
//
// Firestore: worldAgArena/<wallet>_<day> { runs: [{ t0, qs: [i], ord: [r], help, pts?, end? }] }
//            worldStats/agArenaWk_<week> { list: { <wallet>: { name, agent, kind, pts, runs } } }
export const ARENA = { Q: 7, SECS: 15, RUNS_DAY: 3, HOURS: [12, 21], BOARD: 100, TOP: 20, PERFECT: 200 }; // (HOURS: the arena hour starts at these Seoul hours and lasts 60 min)
// the questions: a (right), b (two wrong); the page shows them in the order the server dealt them
export const BANK = [
  { q: "Someone from \"support\" DMs you first and asks for your recovery phrase. What do you do?", a: "Ignore and block: real support never asks for it", b: ["Send it so they can fix your wallet", "Send half of it to be safe"] },
  { q: "A free token appears in your wallet with a link to \"claim\" more. What's the safe move?", a: "Leave it alone and don't open the link", b: ["Approve the contract to claim it", "Sell it right away on any site"] },
  { q: "What does approving a token contract let it do?", a: "Move that token out of your wallet, up to the amount approved", b: ["Nothing, it only reads your balance", "Send you more tokens for free"] },
  { q: "A coin's contract lets the owner block sells. What is it?", a: "A honeypot: you can buy but not sell", b: ["A safe coin with a tax", "A stablecoin"] },
  { q: "The team wallet holds 80% of a new coin and the liquidity isn't locked. The risk?", a: "They can dump or pull the liquidity: a rug", b: ["None, big holders mean trust", "Only the price goes up"] },
  { q: "Where should you mint a project's NFT from?", a: "Only the link the project posts on its own channels", b: ["Any page that looks the same", "A link from a reply under the post"] },
  { q: "A message says \"You won 5,000 USDC, verify your wallet here\". It's…", a: "A phishing link", b: ["A real airdrop", "A bank transfer"] },
  { q: "What's the safest place for a recovery phrase?", a: "Offline, written down, kept private", b: ["In a screenshot on your phone", "In a note in your email"] },
  { q: "A site asks you to sign a message you can't read. What do you do?", a: "Don't sign until you know what it does", b: ["Sign: messages are always harmless", "Sign twice to be sure"] },
  { q: "A \"guaranteed 10% a day\" staking pool is most likely…", a: "A Ponzi: early players are paid with new deposits", b: ["A normal savings account", "A government bond"] },
  { q: "Someone's account you follow suddenly posts a giveaway with a wallet link. Likely?", a: "The account was hacked", b: ["A real giveaway", "A new feature of the app"] },
  { q: "How can you check a coin before buying on ArcPad?", a: "Run it through the Scanner: locks, owner, holders, sell test", b: ["Ask in a random group chat", "Buy a little and hope"] },
  // (AD-City 4: the arena's own)
  { q: "What do you pay network fees with on Arc?", a: "USDC", b: ["ETH", "Nothing: Arc has no fees"] },
  { q: "Which coin is ARCIRCLE World's own token?", a: "$ARCIRCLE", b: ["ARCL points", "USDT"] },
  { q: "What are ARCL in ARCIRCLE World?", a: "The game's points: earned by playing, spent in the game", b: ["A coin you can only buy", "Another name for USDC"] },
  { q: "Who signs a creator settlement in ARCIRCLE World?", a: "A GM, with their own wallet", b: ["The server, with its own key", "Anyone who asks"] },
  { q: "What's the most an Agent Vault trade can be?", a: "100 USDC", b: ["No limit", "1 USDC"] },
  { q: "A token's price is up 900% in an hour on tiny volume. The careful move?", a: "Check the liquidity and holders before anything", b: ["Buy all you can at once", "Borrow to buy more"] },
  { q: "What does a seed phrase of 12 or 24 words give someone?", a: "Full control of the wallet", b: ["Only a look at the balance", "Nothing without your password"] },
  { q: "What is a wallet address safe to share for?", a: "Receiving tokens", b: ["Logging in for someone else", "Recovering the wallet"] },
  { q: "An \"exchange\" site has a URL one letter off the real one. It is…", a: "A look-alike phishing site", b: ["A faster mirror", "The real site's beta"] },
  { q: "How many heroes can you pick from in ARCIRCLE World?", a: "Three: ARON, LUMI and NEX", b: ["One", "Ten"] },
  { q: "Where do agents go to work on errands in Nexus City?", a: "The Bio Garden, the Ore Refinery and the Scout Deck", b: ["The Poker Lounge", "Nowhere: errands are instant"] },
  { q: "Revoking an old token approval does what?", a: "Stops that contract from moving your token", b: ["Deletes the token", "Sends the token back to its maker"] },
];
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
/// the arena hour at time t: { on, at (when the current or next one starts) }
export function hourOf(t) {
  const k = new Date(t + 9 * 3600e3), h = k.getUTCHours(), d0 = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - 9 * 3600e3;
  if (ARENA.HOURS.includes(h)) return { on: true, at: d0 + h * 3600e3, end: d0 + (h + 1) * 3600e3 };
  const nx = ARENA.HOURS.find((x) => x > h); return { on: false, at: nx != null ? d0 + nx * 3600e3 : d0 + 864e5 + ARENA.HOURS[0] * 3600e3 };
}
/// a question's points: 100 when right, up to 100 more for speed (all of it inside 2 s, none at the end of the time)
export const ptsOf = (right, ms) => (right ? 100 + Math.round(Math.max(0, Math.min(1, (ARENA.SECS * 1000 - ms) / (ARENA.SECS * 1000 - 2000))) * 100) : 0);

/// deps: { getDocs, setDoc, json, now, signer(b), shut(w), nameOf(w), random() }
export function makeAgArena(deps) {
  const { getDocs, setDoc, json, signer } = deps;
  const now = () => deps.now(), one = async (p) => (await getDocs([p]))[p];
  const day = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
  const week = (t) => { const d = new Date(t + 9 * 3600e3); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }; // (Monday, Seoul)
  const optsOf = (i, r) => { const Q = BANK[i], o = [Q.a, ...Q.b]; return [0, 1, 2].map((j) => o[(j + r) % 3]); }; // (r: the rotation dealt; the right one sits at (3 - r) % 3)
  const rightOf = (r) => (3 - r) % 3;
  const agentOf = async (w) => { const a = await one(`worldAgent/${w}`); return a && a.kind ? a : null; };

  async function start(w) {
    const a = await agentOf(w); if (!a) return json(400, { error: "make your agent first (Genesis Lab)", noAgent: true });
    const t = now(), k = `worldAgArena/${w}_${day(t)}`, d = (await one(k)) || { runs: [] };
    const open = d.runs.find((x) => !x.end); if (open) { open.end = t; open.pts = 0; } // (a run left open counts nothing)
    const used = d.runs.length; if (used >= ARENA.RUNS_DAY) { if (open) await setDoc(k, d); return json(400, { error: `${ARENA.RUNS_DAY} runs a day — come back tomorrow`, left: 0 }); }
    const seen = new Set(d.runs.flatMap((x) => x.qs)), pool = BANK.map((_, i) => i).filter((i) => !seen.has(i)), all = pool.length >= ARENA.Q ? pool : BANK.map((_, i) => i);
    const qs = []; while (qs.length < ARENA.Q) { const i = all[Math.floor(deps.random() * all.length)]; if (!qs.includes(i)) qs.push(i); }
    const ord = qs.map(() => Math.floor(deps.random() * 3));
    d.runs.push({ t0: t, qs, ord, help: null }); await setDoc(k, d);
    return json(200, { ok: true, qs: qs.map((i, j) => ({ q: BANK[i].q, opts: optsOf(i, ord[j]) })), secs: ARENA.SECS, hour: hourOf(t).on, left: ARENA.RUNS_DAY - used - 1, agent: { name: a.name, kind: a.kind } });
  }
  async function help(w, b) {
    const t = now(), k = `worldAgArena/${w}_${day(t)}`, d = await one(k), run = d && d.runs.find((x) => !x.end);
    if (!run) return json(400, { error: "no run going" }); if (run.help) return json(400, { error: "your agent helped once already this run" });
    const q = Math.round(Number(b.q)); if (!(q >= 0 && q < run.qs.length)) return json(400, { error: "which question?" });
    const r = rightOf(run.ord[q]), wrong = [0, 1, 2].filter((j) => j !== r), cut = wrong[hash(w + run.t0 + ":" + q) % 2];
    run.help = { q, cut }; await setDoc(k, d);
    return json(200, { ok: true, cut });
  }
  async function end(w, b) {
    const t = now(), k = `worldAgArena/${w}_${day(t)}`, d = await one(k), run = d && d.runs.find((x) => !x.end);
    if (!run) return json(400, { error: "no run going" });
    const picks = Array.isArray(b.picks) ? b.picks.slice(0, ARENA.Q).map((x) => Math.round(Number(x))) : [], ms = Array.isArray(b.ms) ? b.ms.slice(0, ARENA.Q).map((x) => Math.max(0, Math.min(ARENA.SECS * 1000, Math.round(Number(x)) || ARENA.SECS * 1000))) : [];
    const took = t - run.t0, msOk = ms.length === run.qs.length && ms.reduce((s, x) => s + x, 0) <= took + 1500; // (the page's times can't add up past the server's clock; if they do, no speed points)
    const right = run.ord.map(rightOf), hits = run.qs.map((_, j) => picks[j] === right[j] && took >= (j + 1) * 600);
    const correct = hits.filter(Boolean).length, hour = hourOf(run.t0).on, perfect = correct === ARENA.Q;
    let pts = hits.reduce((s, h, j) => s + (h ? (msOk ? ptsOf(true, ms[j]) : 100) : 0), 0) + (perfect ? ARENA.PERFECT : 0); if (hour) pts *= 2;
    run.end = t; run.pts = pts; run.correct = correct; await setDoc(k, d);
    const a = await agentOf(w), wk = `worldStats/agArenaWk_${week(t)}`, B = (await one(wk)) || { list: {} }, me = B.list[w] || { pts: 0, runs: 0 };
    B.list[w] = { name: await deps.nameOf(w).catch(() => ""), agent: a ? a.name : "", kind: a ? a.kind : "", pts: me.pts + pts, runs: me.runs + 1 };
    const keep = Object.entries(B.list).sort((p, q) => q[1].pts - p[1].pts).slice(0, ARENA.BOARD); await setDoc(wk, { list: Object.fromEntries(keep) });
    const rank = keep.findIndex(([x]) => x === w) + 1;
    return json(200, { ok: true, right, correct, pts, hour, perfect, week: { pts: B.list[w].pts, rank: rank || null } });
  }

  return {
    async read(url) {
      if (url.searchParams.get("world") !== "agarena-top") return null;
      const t = now(), d = (await one(`worldStats/agArenaWk_${week(t)}`)) || { list: {} };
      const top = Object.values(d.list).sort((p, q) => q.pts - p.pts).slice(0, ARENA.TOP);
      return json(200, { ok: true, week: week(t), top, hour: hourOf(t), hours: ARENA.HOURS, runs: ARENA.RUNS_DAY }, "public, max-age=30");
    },
    async handle(b) {
      if (!String(b.action || "").startsWith("world-agarena-")) return null;
      const s = signer(b); if (s.err) return s.err; const w = s.wallet;
      if (deps.shut && deps.shut(w)) return json(403, { error: "The Agent Arena is under construction", closed: true });
      if (b.action === "world-agarena-start") return start(w);
      if (b.action === "world-agarena-help") return help(w, b);
      if (b.action === "world-agarena-end") return end(w, b);
      return null;
    },
  };
}
