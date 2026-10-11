// world-season.js — the season log and the scam quiz (shown in the Adventure log, world-quests.js).
//   season   28 days at a time (Seoul time, from Monday 5 October 2026). Points come from playing: knock-outs, daily
//            hunts, the quiz, the raid. Ten tiers, each with a reward to claim — XP, scrap, potions, gear, and at the
//            top a title. Never ARCL.
//   quiz     five questions a day from the bank below, the same five for everyone; XP for each right answer, once a day.
const DAY = 864e5;
export const SEASON_START = Date.UTC(2026, 9, 4, 15); // Monday 5 October 2026, 00:00 in Seoul
export const SEASON_DAYS = 28;
export function seasonOf(t = Date.now()) {
  const n = Math.max(0, Math.floor((t - SEASON_START) / (SEASON_DAYS * DAY)));
  const start = SEASON_START + n * SEASON_DAYS * DAY;
  return { id: n + 1, start, ends: start + SEASON_DAYS * DAY };
}
// what playing is worth on the season log
export const SEASON_PTS = { kill: 1, elite: 3, boss: 15, daily: 10, quiz: 10, raid: 25, chest: 5 };
// the ten tiers: the points they need and their reward (kind: xp, scrap, hp, sp, recall, gear (rarity r), title)
export const SEASON_TIERS = [
  { pts: 40, kind: "scrap", n: 60 },
  { pts: 100, kind: "hp", n: 3 },
  { pts: 180, kind: "xp", n: 150 },
  { pts: 280, kind: "scrap", n: 150 },
  { pts: 400, kind: "gear", r: 2 },
  { pts: 550, kind: "sp", n: 4 },
  { pts: 720, kind: "xp", n: 400 },
  { pts: 920, kind: "recall", n: 3 },
  { pts: 1150, kind: "scrap", n: 400 },
  { pts: 1400, kind: "gear", r: 3, title: true },
];
export const tierOf = (pts) => SEASON_TIERS.filter((x) => pts >= x.pts).length;

// the quiz: each question has one right answer (a) and two wrong ones; the game shuffles them
export const QUIZ = [
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
];
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
/// today's five questions, with their answers in a fixed shuffled order: [{ i, q, opts: [text], right }]
export function quizFor(day) {
  const h = hash("quiz" + day), out = [], used = new Set();
  for (let k = 0; out.length < 5 && k < 60; k++) {
    const i = hash(day + ":" + k) % QUIZ.length; if (used.has(i)) continue; used.add(i);
    const Q = QUIZ[i], opts = [Q.a, ...Q.b], rot = (h >> (out.length * 2)) % 3;
    const order = [0, 1, 2].map((j) => (j + rot) % 3);
    out.push({ i, q: Q.q, opts: order.map((j) => opts[j]), right: order.indexOf(0) });
  }
  return out;
}
export const QUIZ_XP = 20;
