// api/_arcia-world.mjs — what ARCIA knows about ARCIRCLE WORLD right now (2026-11-01, the owner: "ARCIA should learn our latest
// news and tell new players how to get in, existing players what's new, the rankings and the events, and promote it").
// WORLD_NOW goes into her FACTS (the site chat, Telegram, X replies); worldLive(origin) reads the live boards and events for
// her LIVE block and her hourly X post (api/arcia-x.mjs hourlyPost). KEEP WORLD_NOW CURRENT: add every release players can
// see, the same day it ships (like /game's news in gw.js), newest first, and take out what's over.
export const WORLD_NOW = `ARCIRCLE WORLD now (1 November 2026, the newest — where this and older lines differ, this is current):
  How to start (new players): open arcircle.app/game (the Game World site) and press PLAY FREE, or go straight to arcircle.app/play. It runs in the browser on a phone or a PC, nothing to install. Play as a guest first: make your hero (ARON, LUMI or NEX), learn to move and jump, win the training fight; sign in with a wallet (a free signature, no gas) when you want to keep progress and earn ARCL, the in-game points. The town's plaza has portals to the villages; Menu → Games lists every game.
  Games (9 in the Games list + the town): ARCIRCLE KART (the newest, kart racing: PEPE, DOGE, PENGU, WIF, BONK on 4 tracks — Nexus Circuit, Lunar Loop, Frost Drift, Magma Run; Race, Time Attack with ghosts, a Daily race with a twist; drifts, items, music), Jurassic World (gather, craft, fish, camp, tame and hunt dinosaurs; boss hour 12:00 and 20:00 KST), SURVIVORS ARENA (12-minute survival, evolving weapons, bosses; Classic, Quick and Endless), ARCIA POKER LOUNGE (Hold'em vs AI players and other players, Sit & Go every 2 hours on even UTC hours, blackjack; chips only), INFINITY RINGS (200 ring puzzles, a 60-second time attack), ARCL MINE, AC DEFENSE, COIN JUMP, BEAT STOMP. Also: an RPG town with hunting grounds to Lv 500 and skills, RAID QUEENS (boss raids in the Sky Realm from Lv 100, hard mode, Mythic Crimson Celestial gear), the HALLOWEEN REALM (six hunting grounds Lv 15–400, the Cursed Night every 30 minutes), pets and dinosaur companions, your own island, crews, parties, the AGENT DIMENSION (your AI agent), and ARCIRCLE Studio (arcircle.app/studio: make your own game from templates or a 3D builder and publish it with its own page).
  Events now: ARCIRCLE KART GRAND OPENING EVENT, 31 Oct 13:40 UTC to 3 Nov 13:40 UTC — Event 1: finish 10 races (Race or Daily) to qualify for a 50,000 ARCL reward; Event 2: Magma Run Time Attack championship, the top 10 share 8,000,000 ARCL (3M, 2M, 1M, 500k ×2, 200k ×5); Event 3: post a KART clip on X tagging @ARCIRCLEonArc for 30 / 20 / 10 USDC. The team reviews and pays the prizes after the event ends. Every day: KART's Daily race, Jurassic boss hour, Sit & Go tournaments, daily missions and the fountain coin.
  Newest updates (newest first): 31 Oct the KART Grand Opening event; 30 Oct KART's four tracks, items, music and remaster; 29 Oct ARCIRCLE Studio's official launch with the Asset Store, RAID QUEENS hard mode and crown fragments; 28 Oct the Halloween Realm and Obby World (3D games in the Studio); 27 Oct the Creator Hub and a new menu.
  Rankings: each game keeps a weekly board (KART per track, SURVIVORS, INFINITY RINGS, poker, RAID QUEENS fastest clears) shown in the game and on arcircle.app/game.
  Never promise earnings: ARCL rewards have daily caps and some prizes are paid by the team after a review.`;

const get = async (origin, q) => { try { const r = await fetch(`${origin}/api/social?world=${q}`, { signal: AbortSignal.timeout(2500) }); return r.ok ? await r.json() : null; } catch { return null; } };
const who = (x) => x && (x.name || x.w || "?");

/// the live side: players online, the event's phase, the weekly #1s. Every read is short and may fail (then it's left out).
export async function worldLive(origin) {
  const [stats, ev, kNexus, kVol, surv, rings] = await Promise.all([get(origin, "stats"), get(origin, "kart-event"), get(origin, "kart-top&track=nexus"), get(origin, "kart-top&track=volcano"), get(origin, "surv-top"), get(origin, "rings-top")]);
  const top = (b, f) => (b && b.top && b.top[0] ? f(b.top[0]) : null);
  return {
    online: stats ? stats.online || 0 : null, players: stats ? stats.players || 0 : null,
    event: ev ? { phase: ev.phase, end: ev.end, counts: ev.counts } : null,
    kart: { nexus: top(kNexus, (x) => `${who(x)} ${x.t}s`), volcano: top(kVol, (x) => `${who(x)} ${x.t}s`) },
    surv: top(surv, (x) => `${who(x)} survived ${Math.floor(x.secs / 60)}:${String(x.secs % 60).padStart(2, "0")}`),
    rings: top(rings, (x) => `${who(x)} ${x.stars} stars`),
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
  ].filter(Boolean).join("\n");
}

// the hour's topic (one each hour, round the list): new players' way in, what's new for players who know us, the rankings,
// the events, and each game in turn — every post a reason to come and play (2026-11-01, the owner)
export const HOUR_TOPICS = [
  { k: "start", say: "for people who've never played: how to get in — arcircle.app/game, PLAY FREE, in the browser on a phone or PC, play as a guest first, a wallet later to keep progress" },
  { k: "kart", say: "ARCIRCLE KART — the newest game, and its Grand Opening event if it's on" },
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
