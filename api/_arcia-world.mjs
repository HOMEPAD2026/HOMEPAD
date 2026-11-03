// api/_arcia-world.mjs — what ARCIA knows about ARCIRCLE WORLD right now (2026-11-01, the owner: "ARCIA should learn our latest
// news and tell new players how to get in, existing players what's new, the rankings and the events, and promote it").
// WORLD_NOW goes into her FACTS (the site chat, Telegram, X replies); worldLive(origin) reads the live boards and events for
// her LIVE block and her hourly X post (api/arcia-x.mjs hourlyPost). KEEP WORLD_NOW CURRENT: add every release players can
// see, the same day it ships (like /game's news in gw.js), newest first, and take out what's over.
export const WORLD_NOW = `ARCIRCLE WORLD now (3 November 2026, the newest — where this and older lines differ, this is current):
  How to start (new players): open arcircle.app/game (the Game World site) and press PLAY FREE, or go straight to arcircle.app/play. It runs in the browser on a phone or a PC, nothing to install. Play as a guest first: make your hero (ARON, LUMI or NEX), learn to move and jump, win the training fight; sign in with a wallet (a free signature, no gas) when you want to keep progress and earn ARCL, the in-game points. The town's plaza has portals to the villages; Menu → Games lists every game.
  Games (9 in the Games list + the town): ARCIRCLE KART (the newest, kart racing: PEPE, DOGE, PENGU, WIF, BONK on 5 tracks — Galaxy Gauntlet (new: long, hard, in space), Nexus Circuit, Lunar Loop, Frost Drift, Magma Run; Race, Time Attack with ghosts, a Daily race with a twist; drifts, items, music), Jurassic World (gather, craft, fish, camp, tame and hunt dinosaurs; boss hour 12:00 and 20:00 KST), SURVIVORS ARENA (12-minute survival, evolving weapons, bosses; Classic, Quick and Endless), ARCIA POKER LOUNGE (Hold'em vs AI players and other players, Sit & Go every 2 hours on even UTC hours, blackjack; chips only), INFINITY RINGS (200 ring puzzles, a 60-second time attack), ARCL MINE, AC DEFENSE, COIN JUMP, BEAT STOMP. Also: an RPG town with hunting grounds to Lv 500 and skills, RAID QUEENS (boss raids in the Sky Realm from Lv 100, hard mode, Mythic Crimson Celestial gear), the HALLOWEEN REALM (six hunting grounds Lv 15–400, the Cursed Night every 30 minutes), pets and dinosaur companions, your own island, crews, parties, the AGENT DIMENSION (your AI agent), and ARCIRCLE Studio (arcircle.app/studio: make your own game from templates or a 3D builder and publish it with its own page).
  Events now: ARCL LAUNCH — ARCL, the game coin, launches on Robinhood Chain on Tue 3 Nov 2026 at 8:00 PM Korea time (11:00 UTC, 6:00 AM US Eastern); it may start up to 30 minutes late, and further notices come on X (@ARCIRCLEonArc) and Telegram; the countdown and the full guide are on arcircle.app/arcl. The contract address is posted only on @ARCIRCLEonArc, the official Telegram and arcircle.app/arcl — never give or guess an address, and tell people to ignore addresses sent in DMs. ARCIRCLE KART GRAND OPENING EVENT, 31 Oct 13:40 UTC to 3 Nov 13:40 UTC — Event 1: finish 10 races (Race or Daily) to qualify for a 50,000 ARCL reward; Event 2: Magma Run Time Attack championship, the top 10 share 8,000,000 ARCL (3M, 2M, 1M, 500k ×2, 200k ×5); Event 3: post a KART clip on X tagging @ARCIRCLEonArc for 30 / 20 / 10 USDC. The team reviews and pays the prizes after the event ends. Every day: KART's Daily race, Jurassic boss hour, Sit & Go tournaments, daily missions and the fountain coin.
  Newest updates (newest first): 3 Nov arcircle.app/arcl: the ARCL launch page — ARCL is the game's own coin, apart from $ARCIRCLE (the ecosystem token on Arc); it launches on Robinhood Chain (see Events now) with a 3% fee a trade: 1% for $ARCL, 1% buys back and burns $ARCIRCLE, 1% for the game platform. The page lists every place to earn ARCL (KART, SURVIVORS, RAID QUEENS, INFINITY RINGS, the ARCL Mine, Jurassic, poker missions, hunting, check-in …) with their daily limits, the exchange (ARCL → $ARCIRCLE settled by the treasury, buying $ARCIRCLE with USDC) and what ARCL buys. In-game ARCL stays in each player's account and keeps working; how it connects to the coin will be announced on X and Telegram — never say more than that, and never promise prices or returns. 3 Nov arcircle.app/agents: a page for ARCIRCLE's AI agents — this week's busiest agents, what agents do today (Genesis Lab, chat, errands, Arena, Academy) and the trading agents coming next on Arc (DCA, buy below, take profit, stop loss, buyback & burn, from a vault only the player owns, ≤100 USDC a trade); trading opens only after the vault's fixes are re-audited with Arc Studio — never say it is live yet. 2 Nov in-game $ARCIRCLE buying: when a $ARCIRCLE payment (KART SHOP, Asset Store, shop, agent, RAID QUEENS ticket) finds the wallet short, the game offers to swap the rest from USDC on Arc (ARCIRCLE Swap, Uniswap v4; 1% slippage at most; USDC gas, settles in about a second) and then the purchase goes on — no need to leave the game. 2 Nov KART: the ROCKET ROADSTER (a new LEGENDARY car in the KART SHOP, 1,000,000 $ARCIRCLE — half burned, half to the treasury) has a ROCKET JUMP: tap Jump on a phone or press Q and its rocket thrusters lift it off the road for about two seconds, over rug pulls and bombs, then it lands on a short turbo (once every 7 s; it never goes faster than a boost); and GALAXY GAUNTLET, a new space track — 1.7 km a lap, the longest and hardest: hairpins, a wormhole tunnel, and two stretches with no rails where driving off the glowing edge drops you into space (you're put back, slower). 2 Nov the $ARCL → $ARCIRCLE EXCHANGE relaunched — the Exchange button on the dock (bottom left): exchange the $ARCL you earn for $ARCIRCLE at the rate the treasury sets and shows in the window (opening rate: 10 $ARCL = 1 $ARCIRCLE; the treasury may change it, the window always shows the current one); your $ARCL is held and the rate locked in when you ask, the treasury pays from its own wallet on Arc, and every settled exchange is on the window's Public record with its transaction link; it works one way only — $ARCIRCLE → $ARCL is closed (3 Nov), so never tell anyone to send $ARCIRCLE to the treasury; the $ARCIRCLE comes from the game itself — every $ARCIRCLE spent in the game's shops is 50% burned and 50% sent to the treasury, which funds the exchange; one wallet can exchange at most 300,000 $ARCIRCLE a day; requests from before the relaunch were closed and their held $ARCL returned; 1 Nov the KART SHOP — 🛒 SHOP on KART's pick screen, six cars bought with $ARCIRCLE (half burned, half to the treasury): LEGENDARY 300,000 — ARC LIGHTSPEED (top speed, longer turbos; heavy steering), CIRCLE ORBIT (strong everywhere, faster nitro); EPIC 100,000 — PEGMASTER (USDC; steady, recovers fast), BLOXBUSTER (shoves rivals), KAIRO KLIK (best acceleration), ARGUS WATCHER (fastest drift turbos); each a strength and a weakness, small differences; Paint & Wraps, Boost Trails, Racer Outfits and Item Skins come next; 31 Oct the KART Grand Opening event; 30 Oct KART's four tracks, items, music and remaster; 29 Oct ARCIRCLE Studio's official launch with the Asset Store, RAID QUEENS hard mode and crown fragments; 28 Oct the Halloween Realm and Obby World (3D games in the Studio); 27 Oct the Creator Hub and a new menu.
  Rankings: each game keeps a weekly board (KART per track, SURVIVORS, INFINITY RINGS, poker, RAID QUEENS fastest clears) shown in the game and on arcircle.app/game.
  Never promise earnings: ARCL rewards have daily caps and some prizes are paid by the team after a review.`;

const get = async (origin, q) => { try { const r = await fetch(`${origin}/api/social?world=${q}`, { signal: AbortSignal.timeout(2500) }); return r.ok ? await r.json() : null; } catch { return null; } };
const who = (x) => x && (x.name || x.w || "?");

/// the live side: players online, the event's phase, the weekly #1s. Every read is short and may fail (then it's left out).
export async function worldLive(origin) {
  const [stats, ev, kNexus, kVol, surv, rings, swap] = await Promise.all([get(origin, "stats"), get(origin, "kart-event"), get(origin, "kart-top&track=nexus"), get(origin, "kart-top&track=volcano"), get(origin, "surv-top"), get(origin, "rings-top"), get(origin, "swap")]);
  const top = (b, f) => (b && b.top && b.top[0] ? f(b.top[0]) : null);
  return {
    online: stats ? stats.online || 0 : null, players: stats ? stats.players || 0 : null,
    event: ev ? { phase: ev.phase, end: ev.end, counts: ev.counts } : null,
    kart: { nexus: top(kNexus, (x) => `${who(x)} ${x.t}s`), volcano: top(kVol, (x) => `${who(x)} ${x.t}s`) },
    surv: top(surv, (x) => `${who(x)} survived ${Math.floor(x.secs / 60)}:${String(x.secs % 60).padStart(2, "0")}`),
    rings: top(rings, (x) => `${who(x)} ${x.stars} stars`),
    swap: swap && swap.ok ? { rate: swap.rate || 0, open: !!swap.open, n: (swap.totals && swap.totals.n) || 0, arc: (swap.totals && swap.totals.arc) || 0 } : null, // (EX: the exchange's posted rate and its record)
  };
}
export function worldText(W) {
  if (!W) return "";
  const k = W.kart || {};
  return [
    W.online != null ? `- ARCIRCLE WORLD now: ${W.online} online, ${W.players} players with a saved hero` : "",
    W.event && W.event.phase === "on" ? `- KART GRAND OPENING EVENT is on until ${new Date(W.event.end).toISOString().slice(0, 16).replace("T", " ")} UTC (qualified for Event 1 so far: ${W.event.counts.qualified}; Magma Run board entries: ${W.event.counts.ta})` : W.event && W.event.phase === "over" ? "- the KART GRAND OPENING EVENT has ended; prizes are being reviewed" : "",
    k.nexus || k.volcano ? `- KART this week's #1: ${[k.nexus && `Nexus Circuit ${k.nexus}`, k.volcano && `Magma Run ${k.volcano}`].filter(Boolean).join(", ")}` : "",
    W.surv ? `- SURVIVORS this week's #1: ${W.surv}` : "",
    W.rings ? `- INFINITY RINGS this week's #1: ${W.rings}` : "",
    W.swap ? (W.swap.rate ? `- The Exchange: 1 $ARCIRCLE = ${W.swap.rate} $ARCL (set by the treasury${W.swap.open ? "" : ", paused right now"}); ${W.swap.n} exchanges settled, ${W.swap.arc.toLocaleString("en-US")} $ARCIRCLE paid out` : "- The Exchange: the treasury hasn't posted the rate yet") : "",
  ].filter(Boolean).join("\n");
}

// the hour's topic (one each hour, round the list): new players' way in, what's new for players who know us, the rankings,
// the events, and each game in turn — every post a reason to come and play (2026-11-01, the owner)
export const HOUR_TOPICS = [
  { k: "start", say: "for people who've never played: how to get in — arcircle.app/game, PLAY FREE, in the browser on a phone or PC, play as a guest first, a wallet later to keep progress" },
  { k: "kart", say: "ARCIRCLE KART — the newest game, and its Grand Opening event if it's on" },
  { k: "shop", say: "the new KART SHOP (KART GARAGE): six cars with their own strengths and weaknesses — ARC LIGHTSPEED and CIRCLE ORBIT (LEGENDARY), PEGMASTER, BLOXBUSTER, KAIRO KLIK, ARGUS WATCHER (EPIC) — bought with $ARCIRCLE, half of every purchase burned" },
  { k: "new", say: "for players who already know us: the newest updates (from 'Newest updates')" },
  { k: "ranks", say: "this week's leaderboards: name the #1s from LIVE and dare people to beat them" },
  { k: "events", say: "what's on today and right now (the KART event if on, KART's Daily race, Jurassic boss hour 12:00/20:00 KST, Sit & Go on even UTC hours)" },
  { k: "studio", say: "ARCIRCLE Studio — make your own game in the browser and share it" },
  { k: "start", say: "for newcomers: one quick reason to try ARCIRCLE WORLD today and how to start in a minute" },
  { k: "survivors", say: "SURVIVORS ARENA" },
  { k: "raid", say: "RAID QUEENS and the Halloween Realm, for the strongest players" },
  { k: "jurassic", say: "Jurassic World and its boss hour" },
  { k: "poker", say: "ARCIA POKER LOUNGE and its Sit & Go tournaments" },
  { k: "rings", say: "INFINITY RINGS puzzles and the time attack" },
];

// ARCIRCLE KART's play video on X (the owner, 2026-11-01): whenever ARCIA talks about KART — her hourly post, a reply or a
// Telegram message — she adds this post's LINK under her words (a link, never the video itself: no quote, no preview).
export const KART_VIDEO_ID = "2116461206496297015";
export const KART_VIDEO = `https://x.com/ARCIRCLEonArc/status/${KART_VIDEO_ID}`;
export const aboutKart = (t) => /\bkart\b|pepe|doge|pengu|\bwif\b|bonk|magma run|nexus circuit|frost drift|lunar loop|time attack|카트/i.test(String(t || ""));
// ARCIRCLE's official links / info post on X (the owner, 2026-11-01): its link goes along whenever ARCIA gives the official links
// or official info (contract, website, how to buy …), and now and then in her promotion posts (OFFICIAL_EVERY).
export const OFFICIAL_POST_ID = "2116712761808081407";
export const OFFICIAL_POST = `https://x.com/ARCIRCLEonArc/status/${OFFICIAL_POST_ID}`;
export const OFFICIAL_EVERY = 4;
export const aboutOfficial = (t) => /\bofficial\b|\bcontract\b|\bCA\b|token address|website|homepage|\blinks?\b|how (do i|to|can i) buy|where (to|can i) buy|공식|컨트랙트|씨에이|웹사이트|홈페이지|링크|구매 방법|官方|合约|官网|链接/i.test(String(t || ""));
const xLen = (s) => s.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
function addLink(s, id, url, mark, max) { if (s.includes(id)) return s; const out = `${s}\n\n${mark} ${url}`; return xLen(out) <= max ? out : s; }
/// a reply / message about KART carries the video's link (only if it still fits: X counts a link as 23)
export function withKartVideo(t, max = 280) { const s = String(t || ""); return aboutKart(s) ? addLink(s, KART_VIDEO_ID, KART_VIDEO, "🎬", max) : s; }
/// official links / info → the official post's link; force = a promotion post that takes it this time
export function withOfficial(t, max = 280, force = false, about = "") { const s = String(t || ""); return force || aboutOfficial(s) || aboutOfficial(about) ? addLink(s, OFFICIAL_POST_ID, OFFICIAL_POST, "📌", max) : s; }
// the KART SHOP's launch post on X (the owner, 2026-11-01): when ARCIA talks about the shop / the garage / its six cars, its link goes along
export const SHOP_POST_ID = "2117007966016786909";
export const SHOP_POST = `https://x.com/ARCIRCLEonArc/status/${SHOP_POST_ID}`;
export const aboutShop = (t) => /kart shop|\bgarage\b|lightspeed|circle orbit|pegmaster|bloxbuster|kairo klik|argus watcher|(new|six|6) (cars|karts)|buy a (car|kart)|카트 상점|차고|신차|卡丁车商店|车库|mağaza|garaj/i.test(String(t || ""));
export function withShop(t, max = 280) { const s = String(t || ""); return aboutShop(s) ? addLink(s, SHOP_POST_ID, SHOP_POST, "🛒", max) : s; }
/// ONE link a post at most (the owner, 2026-11-01): KART's video first, else the official post; nothing added to a text that has a link
export function withLinks(t, max = 280, o = {}) { const s = String(t || ""); if (/https?:\/\//.test(s)) return s; const sh = withShop(s, max); if (sh !== s) return sh; const k = withKartVideo(s, max); return k !== s ? k : withOfficial(s, max, !!o.official, o.about || ""); }
