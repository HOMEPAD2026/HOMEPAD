# Notes for Claude

## Writing tweets / X posts for ARCIRCLE

When the owner asks for a tweet (트윗글), write it in English, in the voice of the reference post below:

- Open with `♾️ ARCIRCLE WORLD — <bold headline>. 💙💚`.
- Big-vision, energetic, community-first tone: short punchy lines, lots of white space, one idea per line.
- Section headers with a single emoji (🌍, 🚀, 🛡️ …) and short ALL-CAPS hooks ("PLAY TO EARN. REAL CRYPTO. REAL REWARDS.").
- Bullet lists with `•` for features; repeated "More …" lines for momentum.
- Moderate emoji use — headers and a few accents, not every line.
- Be honest about the state of things: say what is built and tested, what is being polished next, and when
  rewards or costs are deliberately conservative (and that rewards will expand). Never promise guaranteed earnings.
- Close with `♾️ ARCIRCLE WORLD — Play. Build. Battle. Earn.`, then `🌐 https://www.arcircle.app/game` (the owner asked for this link on 2026-10-20, not /play),
  then `$ARCIRCLE #ARCIRCLE #Arc #GameFi #PlayToEarn #Web3Gaming`.
- Length: as long as the owner asks (long posts are fine; they post with X Premium).

### Reference post

```
♾️ ARCIRCLE WORLD — Our Dream Is to Become the Roblox of Crypto. 💙💚

Do you know Roblox?

Roblox has approximately 123 MILLION daily active users, with 29 BILLION hours of engagement in a single quarter.

Why is Roblox so successful?

Because it's not just one game. It's an entire universe where millions of people can explore, create, build, compete, socialize, and enjoy countless different games together.

That's exactly the kind of future we envision for ARCIRCLE WORLD.

But we want to take it one step further.

🌍 One World. Countless Games. Endless Possibilities.

We want to build a massive gaming universe for the crypto community.

A world where you can:

• Explore countless games within one connected world.
• Build your own towns, homes, and communities.
• Complete missions and quests with friends.
• Fight monsters, challenge bosses, and compete against other players.
• Develop your characters, level up, and collect powerful equipment.
• Participate in tournaments, battles, and multiplayer adventures.
• Discover new games, challenges, and experiences as our universe expands.

And most importantly…

PLAY TO EARN. REAL CRYPTO. REAL REWARDS.

We don't want players to simply spend their time playing.

We want to create opportunities for players to earn real $ARCIRCLE and potentially receive real USDC rewards through gameplay, competitions, achievements, and future reward systems.

Not just virtual points.

Real tokens. Real utility. Real opportunities to earn.

Imagine playing your favorite games, building your own world, completing missions with friends, defeating powerful bosses, and earning crypto along the way.

That's the future we want to build.

🚀 100 DAYS OF BUILDING.

We are only at the beginning.

Over these 100 days, we aim to deliver enormous changes in development, graphics, gameplay, content, and overall quality.

More games.
More worlds.
More adventures.
More competitions.
More ways to earn.
More reasons to come back every day.

And we will keep raising the quality of everything we create.

Our vision is not to build just another crypto game.

Our vision is to build the ROBLOX OF CRYPTO.

A living, expanding gaming universe powered by community, creativity, competition, and real blockchain utility.

Our journey has just begun.

Our ambitions are enormous.

And we will keep building, improving, and expanding.

100 days can change everything.

Stay tuned for what's coming next.

♾️ ARCIRCLE WORLD — Play. Build. Battle. Earn.

🌐 https://www.arcircle.app/game

$ARCIRCLE #ARCIRCLE #Arc #GameFi #PlayToEarn #Web3Gaming
```

## After every commit: tweet + reference shots + image prompt

The owner asked for this on every commit (not only when they ask):

- A tweet in the style above, its length matched to the update (a small fix: a few lines; a big feature batch: a long
  post). Only claim what was built and verified; say what's next.
- 2–3 real screenshots of the change as reference images (phone layout 390x844 and/or desktop), saved where the owner
  can open them (scratchpad / SendUserFile), never mock-ups.
- A ready-to-paste prompt for an image AI to make the promo image from those shots: subject, composition, the
  ARCIRCLE look (bright stylized 3D, blue glass UI, cyan/mint glow, cute robot hero), exact on-image English text, aspect
  ratio, and what to avoid (no fake UI, no unreadable text, no other brands).

- /game's Featured news and Updates & notices (gw.js NEWS + each language's `news`, `nbody`, `notices`, en/ko/zh/tr):
  add every release that players can see, newest first (the owner asked for this on 2026-10-23: "keep reflecting the
  updates there"). `nbody` lines up with `news` by index, so a new item goes in front of both; NOTE_D (gw.js) holds each notice's date by its place, so a new notice's date goes in front of NOTE_D too (it was skipped once and every date shifted).

## Before saying a game change is done (checklist)

The owner tests on a real Android phone (Samsung Internet), signed in with a wallet, at high level. Headless desktop
Chrome as a guest is not enough. Before reporting a change to ARCIRCLE World as finished:

- Run every tests/world/*.test.mjs, then rebuild (bump-cache.sh + tools/build-bundles.mjs) and load play.html.
- Then run the browser walk: `node tools/world-walk/walk.mjs` (phone + desktop, signed in: top bar, dock, Menu, launch gift → box → coins,
  Games list → into a game and out twice, the invite sheet's drag-close, a share card, a stale chunk's reload). PASS/FAIL per check;
  screenshots in OUT. Needs playwright (PW=dir with node_modules/playwright) and Chromium (CHROME=path).
- Screenshot the change on the phone layout (390x844, touch: the 980px-wide `wp-pcphone` page) and on desktop.
- Walk the whole flow, not one frame: enter → play → leave → enter again (twice). Check the HUD isn't covered by the
  minimap, wallet/purse row, quest card or joystick.
- Think through the paths the test can't take: signed in (server calls), level 90+, a second run in the same session,
  a failed dynamic import or start. Nothing may fail silently: show a short error toast and reset state.
- Say plainly what was and wasn't verified (e.g. "not checked signed-in on a real phone").
- A deploy replaces /w/ and its content-hashed chunks: a page opened before the deploy asks for chunk names that are
  gone. /w/ keeps every build's chunks from the last 7 days, at least the last 3 builds (tools/build-world.mjs,
  w/.gens.json: by time, because several local builds between two deploys once pushed the live build out and the
  owner's open page couldn't start Survivors), and world-play.js reloads itself when a lazy chunk fails (staleReload:
  once, then once more past the cache with ?fresh=) — never remove either. When testing, also simulate "page opened, then a
  new build landed" (block or delete the lazy chunk) and walk the recovery.
- After the owner deploys, check production through the Vercel MCP tools (this container can't reach arcircle.app
  directly): `list_deployments` (project homepad-arc-deploy) shows which commit is live, and
  `web_fetch_vercel_url https://www.arcircle.app/api/social?world=diag` shows real devices' errors and frame rates.
- A new Game Village game: put `data-game-hud` on its top bar (world-skin.css then zooms it on phones and hides the
  quest card and minimap while it's up) and follow AC Defense / Coin Jump for the fail-safe start and leave.
- Game text: wrap it in TW("…") and put short words and game-only lines in WORDS (world-play.js, ko/zh/tr); sentences
  shared with the site go in i18n-ko/zh/tr.js. T() reads only the site dictionaries, so a word that lives only in
  WORDS shows in English through T(). tests/world/i18n.test.mjs fails on any new untranslated T/TW string.
- `node --check` missed a broken line in an ES module twice: after editing world-*.js, the proof is a clean
  `node tools/build-world.mjs` (it now puts /w/ back untouched when a build fails, and exits 1) plus loading the page.
- Don't end an edit's inserted text with a `//` comment on a one-line statement: it swallows the rest of the line.

## Characters' animations (a mistake that shipped once — don't repeat it)

The heroes (ARON, LUMI, NEX: `K.makeCharacter` → world-kit.js `makeCustom`) play clips by the names in world-kit.js
`CU_AS`: `idle`, `walk`, `sprint`, `jump`, `fall`, `sit`, `lie`, `die`, `hit`, `dodge`, `block`, `attack`, `cast`,
`shoot`, `emote-yes`, `emote-no`. There is **no `run`**: `play("run")` silently falls back to `idle`, and the hero slides
around standing (SURVIVORS ARENA shipped like that). Before using a clip name anywhere new:

- Use only a `CU_AS` key. Moving = `walk` with `speed` scaled to the move speed (the town: `max(0.8, speed / 6.5)`),
  fast = `sprint`. Copy how world-play.js drives the town avatar (`want = … "sprint" : … "walk" : … "idle"`).
- Call `hero.update(dt, t)` every frame, and don't call `play()` while `hero.busy()` (a one-shot is playing).
- Prove it in the browser test for **all three heroes**: read the running clip while moving
  (`hero.mixer._actions.filter((a) => a.isRunning() && a.getEffectiveWeight() > 0.5).map((a) => a.getClip().name)`)
  and check it is a walk/sprint clip, not idle. A screenshot of a hero standing still proves nothing.
- The same goes for any rig (dinosaurs, monsters, pets): list the file's clip names first, and map them on purpose.

## The owner's standing decisions (2026-10-21) — follow them, don't reopen them

- **Regulation and legal matters are the owner's.** Don't raise, assess or comment on regulatory/legal questions (gambling,
  e-money, securities, game-law, KYC …) in reviews, plans or code comments, now or later. Build what's asked.
- **ARCL ⇄ $ARCIRCLE exchange stays open for every ARCL** (by request, settled by a GM — api/_world-swap.mjs).
- **Creator earnings (the hybrid economy):** only the share a buyer paid with PURCHASED ARCL (ARCL bought through the
  exchange) becomes the creator's exchangeable CREATOR_AVAILABLE; what was paid with PLAY / PROMO ARCL goes to a
  creator balance that spends in the game but isn't settled. 80 % creator / 20 % platform, 14 days pending (proposals).
- **Settlements are signed by a GM's own wallet**; the server only records and verifies the tx on Arc. The server never
  holds a private key.
- **Daily caps will keep rising** — keep them as constants in one place per game, not scattered.
- **Record more:** every ARCL movement goes into the ledger (worldArclTx, kept in full), not only the last-30 log.
- **A player's problem comes first (2026-10-24):** when the owner passes on a user's / player's report (a screenshot, a
  Telegram message, "a player says …"), fixing it is the top priority. As soon as it's fixed and verified, commit it on its
  own (not mixed with work in progress) and give the owner the deploy commands right away, before going back to anything else.

## Our 2026 goals (KPIs for December 31, 2026 — the owner's targets, not guarantees)

1. Registered players: 10,000+
2. Peak concurrent players: 100+
3. $ARCIRCLE market cap: $5M+
4. Game releases: 10+ playable games
5. Partnerships & investment: 3+ signed agreements

The vision behind them: the Roblox of crypto. When planning or writing posts, weigh work by what moves these (new
players signing up, reasons to play together at the same time, more playable games). Always call them targets, never
promises.

## What's built in ARCIRCLE World (status map — keep it current)

The owner asked me to know, at a glance, how far each game and system has got, so I can recommend what to do next.
**Update this table in the same commit whenever a feature lands or changes stage** (and fix it whenever it's found
wrong: on 2026-10-20 an old task list still called the poker lounge and Jurassic survival "not started"; both had shipped).
Stages: **Live** (in the Games list / town, server-checked, tested) · **Partial** (playable, a named piece missing) ·
**Planned** (designed or asked for, not built). File names are where to start reading.

| Area | Stage | What's there | What's missing / next candidates |
|---|---|---|---|
| Town & RPG (world-play.js, world-combat.js, world-rpg*.js, world-zones*.js) | Live | open planet, 3 heroes (ARON/LUMI/NEX), Lv 1–500, 5 near + 7 far hunting grounds, gear in 7 slots, forge/enhance/fuse/repair, potions, weekly raid boss, hoverboard race; the Item Codex (2026-10-24, the owner's mock-up: world-codex.js, api/_world-codex.mjs CODEX — 7 slots × 5 tiers × 5 grades = 175 kinds + uniques (jack), marked by the server when a save holds a kind the save's level can wear, kept for good; milestones 10/25/50/100/175 → ARCL via award ("codex", once each) + supplies or the titles cx-collector / cx-legend; a full column → a small stat bonus (CODEX.SET, cxBonus in extraStats); Menu → Item codex and the Adventure log's tab) | codex art for every cell (only 18 weapon pictures cut so far: images/ui/codex/items), a materials/pet/card codex |
| Quests & seasons (world-quests.js, world-season.js) | Live | island tutorial chain, 3+1 daily hunts, achievements & titles, scammer codex, 28-day season tiers, daily scam quiz | season 2 theme / battle-pass-style track |
| Social (world-chat.js, world-crew.js, world-party.js, world-social.js, world-inbox.js) | Live | local chat, friends + 1:1, crews (tag, invite code), hunting party + weekly bounties, guestbook, weekly island contest, inbox gifts | crew HQ / crew-vs-crew board |
| My Island & village (world-island.js, world-village.js, world-style.js, world-showcase.js) | Live | brick builder 36×36 (LAND owners 64×64, 20,000 bricks), styles, village score/level, showcase terrace | — |
| ARCIRCLE LAND (world-land.js, api/_world-land.mjs) | Live (v1) | 20 villages on the outer ring, buy with $ARCIRCLE to the treasury, owner's island on the plot, refunds list | production/staking (deferred by the owner), decorating + visits |
| Pets & dinos (world-pet.js, world-dino*.js, world-dinotown.js) | Live | pet eggs; DINO SOULMATE: wild eggs, 72 h care, hatch, genes/rarity, companion fights, riding (adult), battle ladder, companion in town | real-time 1:1 dino battles / tournaments |
| Jurassic World (world-jurassic.js, world-jursurv.js, world-jurx.js, api/_world-jur.mjs) | Live | separate land: the Primeval Plains (lake, forest, ridges) + the Ember Basin (b-jx3: lava pools, heat, obsidian, sulfur vents; the design doc plans 6 biomes), realistic dinos (raptor, claw, trike, spino, Alpha Raptor, Thornback Titan, a brachiosaur herd), gather (chop/mine/pick), fishing (rod, lake shore), craft at a workbench (rod, armour, cloak, spear II, flare …), camps (20 spots) with huts/beds/campfire/chest, eat, day/night, rain, night danger, hunting; b-jx1: drawn icons, pack tabs (bag/make/missions/codex), 13-step goal chain, guest try-out (gathers kept locally until sign-in), 3 daily missions (300 ARCL each, for taking part); b-jx2: boss hour 12:00 + 20:00 KST (30 min, shared HP, a hunter's share for ≥10 hits, no ARCL), night raids at your camp (3 waves); codex + weekly hunters' board (also on /game), minimap; b-jx4 effects (tree fall, rock shards, big-dino steps/roar, raptor telegraph, fireflies, rain rings, cut-ins); b-jy (world-jury.js + the rest): see-through props (dither between camera and you / the dinosaur), a pointer to the goal's next thing and the boss hour's boss (edge arrow, minimap rim arrow, a reveal), boss tags only from afar, back-on-your-feet card, sounds (scenes jungle/night/basin/swamp/boss drums, stomps, thrust, splash, reel, pings, horn), other hunters shown (world-jur-here presence, pings), boss call 5 min before (town + Jurassic, "Take me there"), MVP card (top hitters, last hit), crew board, weapon marks (thrust/chop/sparks), hit flash + push, weak spot, PERFECT dodge (jump), bosses enraged below half (sweep ring), finisher slow-mo, ARCL for a boss share (200/300) and a held night raid (150), the attack button's context icon, top-row unstacking, pack recent-first + "only what I can make", codex stars, brighter nights (a lamp), gather combo, fishing bobber/bite/catch, craft reveal, footprints and water tremble; b-jy7: the Whispering Mire (3rd land: poison water, swamp boots, reeds, mud, the Bog Stalker, antidote), fossil dig sites (brush card), weather events every 2 h (storm / meteor shower with minable meteorites), taming (bola + berries, a tamed dino follows for the visit), camp visits (card, a like a week, notes from 6 fixed lines, the week's best camps) | biomes 4–6, taming that lasts beyond a visit, other hunters as full characters |
| SURVIVORS ARENA (world-survivors*.js, api/_world-survivors.mjs) | Live | 12-min survival, 3 heroes, weapons/passives/36 cards, bosses w/ phase 2, VAT monsters, ARCL ≤3,000/run, 3 paid runs/day; b-svx (the owner's design): new HUD/cards/lobby, Reroll 3 · Banish 2 · Skip 1, evolution hints + book, 4 pickups (food/magnet/bomb/clock), chest roulette ×1/×3/×5, arena coins → 6 permanent upgrades, 6 achievements (titles), evolution collection, daily challenge (seeded twist, own board, coins only), 'what knocked you out', run stats in diag, effects (big crit numbers, kill rings, combo counter, level-up pillar, skill/evolution cut-ins); b-sv7: each weapon's own sound, heartbeat/low-HP pulse, boss drum, 'Evolution ready next!' cards, what you carry under the cards, dash = dodge clip; modes: Classic 12:00 · Quick 6:00 (content clock ×2, half the ARCL, no week board) · Endless (past the Titan, stronger bosses every 2:30, own board ?world=surv-endless, ARCL only up to 12:00); the 6 achievements are titles in town (Achievements tab, 'sv-<id>'); share card with best combo + evolutions | 2-player co-op, crew-vs-crew board, ghost race |
| ARCIA POKER LOUNGE (world-poker*.js, world-poker-room.js, world-blackjack*.js, api/_world-poker.mjs) | Live | a walkable 3D lounge (b-pk3d: your hero walks to the table, cashier bar, weekly board, style mirror, exit; tap a sign to walk there) with players drawn as heroes in the chairs (cheer on a win, head shake on a fold), solo Hold'em vs 4 AI levels, server-dealt tables (2–6, bots, private code, chat), blackjack vs ARCIA, free daily chips + ARCL→chips one way, 3 daily ARCL missions (never for winning), Opening Festival, weekly top, levels/cosmetics, royal-flush share; b-pky1: game length 6/12/24 hands (blinds rise faster in short games), one-tap bets (½ · ⅔ · pot, with amounts), 'before your turn' moves (check/fold, call any, check), the heroes' faces on the seat plates, your draw explained under the hand name (flush/straight draws with outs), last-10-seconds counter at tables, run-out drama, all-in pulse, cut-in for a full house or better, a gold burst for a big pot, an empty weekly board says 'Be the first!'; b-pky2: scheduled SIT & GO (api/_world-poker.mjs SNG: every 2 h on even UTC hours, sign up with 1,000 chips — back if you cancel —, computers fill the 6 seats, 1,500 tournament chips, blinds up every 5 hands, places from the top, the top 3 share the entries + 5,000 house chips 50/30/20 + poker XP, 'Sit & Go Champion' title; a table left by everyone is finished by the lobby's look; never ARCL), the lobby's Sit & Go card (sign up / cancel / to your seat / watch, auto-seat when it starts), the places card, watchers counted (👁 at the top), other players walking the lounge (world-poker-here, their heroes + name tags, walk/idle clips) and 6 emotes (wave/cheer/laugh/love/GG/dance: your hero's clip + a mark over the head; at a table the chair's hero answers an emote); b-pky3: the last 20 hands kept on the device (Profile → Recent hands → replay street by street → share card), your counts and 12 badges (engine handStats / BADGES: table hands counted by the server in payHand, a solo game's sent with solo-end and kept within its hands), today's rule (engine RULES/ruleOf: one a Seoul day, 8 hands, Double Blinds · Deep Stacks · Turbo · Heads-up vs NEX · All-Star; its own board ?world=poker-rule), a 3-hand tutorial (ARCIA coaches each street and lights the button she'd press; the Lounge Student badge), the computers' styles (STYLES/STYLE_OF: NEX pushes, LUMI careful, ARON bluffs, ARC straight, MINT calls; a word over the seat now and then), card backs and felts for chips (POKER.SHOP, world-poker-look-buy, once), crew tables (private, only the crew sits down; world-poker-crew; the crews' week board in Ranking), three result cards after a solo game (+ share), blackjack side bets Perfect Pairs and 21+3 (BJ.PP/T3, at most the bet; chips only) | multi-table tournaments, a Sit & Go board of winners, a town alert when yours starts, badges as town titles |
| INFINITY RINGS (world-rings*.js, api/_world-rings.mjs) | Live | ring puzzles, 200 levels in 10 chapters (101–200: ice/portal/timer rings, RIFT BOSS at 200 → INFINITY LEGEND), tutorial 1–20, daily boards, weekly themed puzzle a day, TIME ATTACK (60 s, server-replayed, week board, XP only), 100 ARCL a new star (101–200: 50), b-irx (the owner's design): hero in the lobby, chapter cards with chests (hints/styles/XP), hint bag + a free hint a day, 8 ring styles (cosmetic), challenge box (friend's real moves), share card, effects | sounds for the new rings, palace sign with the week's #1 |
| ARCL MINE (world-mine.js, world-minevillage.js) | Live | side-on cave, ores, pickaxe tiers, 10–10,000 ARCL a rock; ore bag shared with Jurassic | — |
| AC DEFENSE / COIN JUMP / BEAT STOMP | Live | tower defence (5 ARCL a wave, ≤150/day) · climb to the crown (3,000 ARCL once a day) · rhythm (XP only) | — |
| Economy (world-shop.js, world-swap.js, world-market.js, api/_world-shop.mjs, api/_world-ledger.mjs, api/_world-market.mjs) | Live (market: v1) | ARCL points (coin logo images/arcl2-*), daily check-in, shop, Exchange ARCL ⇄ $ARCIRCLE by request, launch gift, welcome week, GM rewards; b-ec: the ARCL ledger (every movement in worldArclTx, buckets purchased/cplay/cavail, day + all-time counters, the Wallet tab), Creator Market (island blueprints for ARCL, two-tap buy, 80/20, 14 days pending, only the PURCHASED-paid share settleable), Creator Exchange (GM quote, GM's own wallet pays, tx verified on Arc), GM Team tab (overview, settlements, wallet ledger, refunds, listings, audit log); the planned $ARCL token fee (2%: 1% $ARCIRCLE buyback & burn, 1% ecosystem) is shown as a note on /game and in the ledger — not applied to today's ARCL | the $ARCL token itself (planned on Solana or Robinhood Chain), automated exchange, more item kinds in the market |
| AGENT DIMENSION (world-agent.js, api/_world-agent.mjs, api/_world-agentvault.mjs, contracts/contracts/AgentDimension.sol, world-kit.js makeAgent, models/world/agents) | Live (**open to everyone since 2026-10-24**, the owner's call: AGENT.OPEN true, PRELAUNCH false; an agent costs AGENT.PRICE_ARC 100,000 $ARCIRCLE (list LIST_ARC 200,000, shown struck through), paid from the player's wallet as an ARCIRCLE transfer to FEE_BURN (50 % burned, 50 % treasury), the server checks the receipt's Transfer log and locks the tx in worldPayTx; the login launch card adPromo() in world-play.js until AD_PROMO_END 2026-10-31 15:00 UTC, on every visit for everyone (guests and agent owners too), on top of every other window (z-index 13000; it gives the earlier freeze back), 'Go to the AD Tower' → goAgentTower(); the players' guide (2026-10-24: ad-guide-data.js = window.ARC_AD_GUIDE en/ko/zh/tr, shown by world-adguide.js from the 📖 How to use buttons in the Studio and the agent window, and on /game's #adguide section by gw.js — keep it true to the servers' limits when they change); guests walk into Nexus City too (canEnter true without a wallet; the arena, errands and buying ask for it there); **ARCIRCLE Studio open to everyone too** (2026-10-24, the owner: STUDIO.OPEN true in api/_world-studio.mjs, STUDIO_OPEN in world-play.js's cityBuilding gate); the vault factory still isn't deployed) | the Nexus Infinity Citadel (20 m tall, 78 m east at 95° — K.AGENT_GATE; a sign board that faces you, a 70 m beam, a worn path with 5 agent holograms, a minimap mark; walk up → a warp flash → the agent window; the GLB loads 9 s in); Genesis Lab in 4 steps (pick AURORA / ORION / VEX → ID and name → personality → its birth: a beam, a cut-in with its number); a unique agent ID (@id), a number (#000N, worldAgentNo) and Genesis Founder for the pre-launch ones; free in the pre-launch event (AGENT.PRELAUNCH; a price later: CREATE_ARCL); it walks at your side (human size; walk/sprint/idle from KayKit, a rest pose from the averaged walk), keeps up (past 15 m it steps out of light beside you), its own trail (hearts / shards / afterglow; off on low graphics), a short wave when it arrives; talk (Claude Haiku, 20 a day, a speech bubble over it, it remembers its last errands; ask it for an errand in chat → a confirm card), the day's briefing; errands (gather / mine / scout, 1 slot, 2 at Lv 5, 6 a day; it leaves and comes back in light, progress rings, the loot flies to your bag, a ring when it levels up; a toast or a system notice when it's back), the report card; Agent tab: share card, the week's busiest agents (?world=agent-top); AD3 the Vault tab: the player's own trading vault on Arc (AgentDimensionVault: one per wallet, ≤ 100 USDC a trade — MAX_PER_TX, daily cap, cooldown, the fee in $ARCIRCLE to feeTo, money only back to the owner, loosening waits 1 h, a new agent key / a higher fee wait 24 h), rules in the game (DCA, buy below, take profit, stop loss; ≤ 6), the executor (?world=agent-vault-tick, env AGENT_DIM_KEY; dry without it) — **the factory isn't deployed yet** (contracts/scripts/deploy-agent-dimension.js: the owner deploys and sets AGENT_DIM_FACTORY / AGENT_DIM_KEY / a cron); no chip until you have an agent (the owner's call) ; **AD-City 1–3 (2026-10-23, behind the same door)**: the Citadel warps you into NEXUS CITY (world-adcity.js, its own land LANDS.ad (0, 2400), r 92; built the first time you go in; ?adcity=1 to try as a guest): the owner's Meshy models (models/world/adcity: the Infinity Spire City at the core, Genesis Lab = Infinity Nexus, Errand Port = Orbital Falcon Launch, Vault Tower, Agent Academy = The Infinite Library, Agent Arena, ARCIRCLE Studio = Neon Gaming Citadel; road pieces: highway on the 4 avenues, crossroads on the ring road, 4 raised quarter curves = the ring highway over it; Neon Skyblade flying cars; the owner's panorama images/adcity/sky.webp round it), glass towers, lamps, holo billboards, a back portal; Genesis/Port/Vault open the agent window's tabs, Academy/Arena show what they'll be; AD-City 2: errand stations (Bio Garden / Ore Refinery / Scout Deck, world-adcity.js STATIONS) where everyone's working agents (?world=agent-city, worldStats/agentWork) play cast / attack / shoot (borrowed KayKit clips, asked for again every 2 s), a city crew when nobody's out (?adwork=demo to see six), the job board (api/_world-agent.mjs queue/advance: up to 4 errands wait, the next starts by itself when a slot frees — paid then, backdated —, a finished one in the way is brought back for you, "While you were away" toast); AD-City 3: ARCIRCLE Studio Lite (world-studio.js + world-studio-gen.js = api/_world-studio-gen.mjs, api/_world-studio.mjs): Sky Runner template (theme, speed, length, coins, walls, gaps, lasers, seeded layout), the agent drafts it from a sentence (Claude Haiku, JSON clamped; rules without it; 10 a day), test play (its own scene: sprint / jump / dodge, 3 hearts), save (12 drafts), publish to the Creator Arcade, plays (once in 20 s, the maker's own not counted), likes, best runs; no ARCL; AD-City 1.5 (2026-10-24): pale paving, no ground ring road / crossroads (the owner: a tangle of four-lane roads), avenues from the plaza, the raised ring see-through while you're near it (seeThrough), the city's buildings in the camera's ghosting (occluders), the camera 78 % as far in the city, low graphics: fewer towers and no road models, the city guide (first visit, the map's Nexus City section, cityTo), each building's line under its prompt, station particles, the job board's timeline, diag where 'city'; Studio 2 (2026-10-24): templates Sky Runner · Infinity Dash (no finish, speeds up: dashSpeed, a track DASH_MAX s long) · Arena Survival (top-down, drones / big drones / laser sweeps / coins, genArena: len = 20 × seconds survived) — puzzle and defense still 'coming soon'; per-template slider labels (KNOBS), a preview strip in the editor, a share link /play?sg=<id>, coin pops + combo, speed lines, a near-miss slow-mo, the best per device + 'New best!' + confetti; the Studio pick board by the Studio's door (the arcade's most played, walk up → play it); Studio 4 (2026-10-24, the owner: 'not one-tap random games — simple tools that make a great game when you take care'): the second tier "Build it yourself" for every template — world-studio-build.js (Runner / Dash: walls, moving walls, gaps, lasers, blinking lasers, coins, hearts; and in climb mode the Sky Climb's ledges, moving / breaking platforms, springs, spikes), world-studio-arena.js (the arena from above + a timeline: drones / big drones / sweeps by side and moment, coins, pillars that block you and stop drones), world-studio-tdbuild.js (Tower Defense: the path cell by cell, pads, the waves list, starting gold); pieces, select / copy / paste, undo / redo, red ✕ = what the server drops (cleanBuild / cleanArena / cleanClimb / cleanDefense in api/_world-studio-gen.mjs: a free lane, a reaction gap, one thing a spot, a joined path), the bots' stars live, test from here; rule cards for runs (≤ 2: low / mirror / night / onehp / speedup); the Ring Puzzle's six-board gallery; versions (the last 5 saves, STUDIO.VERS); two new templates in modules of their own: SKY CLIMB (world-studio-climb.js: bounce, steer, the sides wrap, jump / fall clips) and TOWER DEFENSE (world-studio-defense.js: Bolt / Frost / Cannon on pads, upgrade / sell, 10 lives, kills = coins, waves held ×100 = distance); editor's picks (world-studio-pick, a GM's ⭐, listed first, ≤ STUDIO.PICKS); the guide's part 7; AD-City 4 (2026-10-24): the Agent Arena is open (world-agarena.js, api/_world-agarena.mjs ARENA/BANK: 24 questions, 7 a run, 15 s, the server deals without answers and marks at the end on its clock, the agent's 50 : 50 once a run, 3 runs a day, the arena hour 12:00 + 21:00 KST ×2, a perfect run +200, the week's board ?world=agarena-top, no ARCL; tests/world/agarena.test.mjs), the events pill's 'Agent Arena hour', other players' agents beside them in the city (presence ag 'kind:name' via agentLook, adc.others; walk/sprint/idle) | deploy the vault factory + list pools; Studio: a creator's earnings rules, multiplayer templates, Academy lessons, live 1:1 agent duels and a title for the arena's weekly #1, a creator's earnings from the Arcade (hybrid rules) |
| Launchpad & Utility Villages (world-lands.js, api/_world-lots.mjs; b-lpv, the owner's call 2026-10-23) | Live (v1) | lands of their own 2.4 km off the town (past the camera's reach; LANDS lp (2400, 0) / ut (−2400, 0)), reached only by portal: the town's plaza is open now and four portals stand on the old shops' ring (θ21: Launchpad Village φ0 and Utility Village φ70 as the owner's Meshy models models/world/lands/portal-*.glb, Partner Village φ150, Game Village φ300), each land has its portal back; LAUNCHPAD VILLAGE: every ArcPad coin has a lot (no cap), tiered by market cap (LOT_TIERS: Starter < $1k 16×16 bricks/2,000 · S $1k+ 24×24/5,000 · M $10k+ 36×36/10,000 · L $100k+ 48×48/20,000; half a metre a brick; the server keeps the biggest tier reached, worldLotTier), rings round a plaza with a launch tower (the newest launch over it), the biggest tier nearest, a lot keeps its place as coins join, the avenue in from the portal; only the coin's creator builds its lot (island lot mode at the tier's size; old 9×9/13×13 builds load centred, the premium 13×13 keeps its spotlight); UTILITY VILLAGE: K.SHOPS as they stood round the plaza (roads, district signs and tints, lamps); presence in the lands (server inWorld, ghosts okAt), the edge per land, minimap/world map/quest arrow by land (through the portals), 'N here now' under the portals, chat area per land; en/ko/zh/tr | a GM hide button for a lot, visits/likes per lot, holder badges, the land's own minimap shape |
| Partner Village (world-partnervillage.js, world-partner.js, models/world/partners) | Live (stage A) | our official partners' own clearing like the Game Village (PV.PARTNER_VILLAGE: 140 m south-east at (85, 111), r 25, 35 m clear of Airdrop Fields): a gate facing the plaza with its name, a big sign that faces you, a beam, a worn path, a square with a light pillar, 5 plots round it (PARTNERS: a partner is one more entry with its GLB; the rest "Partner plot · Coming soon"); on the minimap (🤝) and the world map (the ring mark → its gate; its own section at the top of the map list: the gate, the KAIRO Tower (you land 10 m off its door, a little to one side so the camera clears the square's pillar), the KAIRO Finance Hub opened straight away); Menu → Partner Village takes you to its gate; its first building the KAIRO Tower (the owner's GLB, 1.0 MB, 16 m, loads when you're within 120 m) → the KAIRO Finance Hub window (the owner's KAIRO banner and mark): Swap, Klik and Disperse open kairo.market in a new tab, $ARCIRCLE's address to copy, docs/site/X links; /game news (10.23) and notice; en/ko/zh/tr | stage B (KAIRO's widget inside the game, if they allow embedding) and C (their Arc contracts: in-game swap quotes signed in the player's wallet, GM rewards through Disperse) — kairo.market/docs couldn't be read from this container; more partners' buildings on the four free plots |
| Halloween Pumpkin Kings (world-pumpking.js, world-pumpking-data.js, api/_world-halloween.mjs, models/world/halloween, world-combat.js spawnExt) | Live (event: 22 Oct – 5 Nov 2026 US Eastern, the owner's call) | by day 5 Pumpkin Kings (the owner's Meshy GLB, 8 clips: walk/run + 4 dances, spin jump, backflip kick) stroll round their homes (HOMES; trees cleared 12 m) and dance on a 15 s beat from the clock (every player sees the same), untouchable, tags 'Wakes at <local time> · Lv N', 🎃 on the minimap; at night (20:00–05:00 US Eastern, 14 nights) each becomes Inferno Jack (the owner's second GLB: idle ×2, walk, run, attack, flip, death) — a boss of the town's combat (spawnExt: a lent body, a 22 m leash round its home, boss patterns by level), Lv 15/35/55/75/95; everyone's HP on the server (reports every 5 s, ≤ 60 × level, your level ≥ the king's − 10; HP lv×3000), falls once a night (death clip, the pumpkin back dancing); the top 3 hitters share its reward (RANK 100/60/40% of 3,000/6,000/10,000/18,000/30,000 ARCL via award — outside the daily cap, in the ledger as 'halloween' — and a +piece: Rare +5 … Legendary +5; Lv 95's 1st: Jack's Inferno Blade, item u:'jack', name in world-rpg-data.js UNIQUE), the reward card; 5-min warning, wake-up toast; /game news + event + notice; ?pk=day / ?pk=night to try | sounds of its own (a laugh, fire), a nightly board of the top hitters on /game, a share card for the blade |
| RAID QUEENS (world-raidq.js, world-raidq-data.js, api/_world-raidq.mjs, models/world/raid, images/raid, audio/music/rq-*) | Partial (GM wallets only: RQ.OPEN false + world-play.js rqOn(); ?rq=1 to look) | 2026-10-24 the owner's call: a run of your own like Survivors, not a shared land. The Crimson Eternity Citadel by the fountain (φ110 θ24) for everyone (a non-GM gets the "Under construction" card: rqSoon); it, the map and the Menu open the lobby (three queens + SECRET ???): a run warps you into the arena (LANDS.rq (0, −2400), r 30) — waves of Imps then elite Puglins (UE rigs, KayKit moves: K.borrowMoves; the queen's colours), then her page (once a Seoul day) and the queen (HP from your attack × seconds: dpsAt), phases at 60 % / 25 %, cut-ins; 3 runs a Seoul day (RQ.DAY_RUNS, GM no cap), the server takes a win no sooner than M.min s and once (worldRqRun / worldRqDone), XP past the save's pace via worldXpGrant (consumed in world-save), items (itemsOf), ARCL as award "raidq" (2,000 / 3,000 / 5,000), best times + clears; SECRET: 10,000 $ARCIRCLE a ticket (the player's transfer to FEE_BURN, receipt checked, worldPayTx lock; GM free), three queens at Lv 72/75/78, ~2 min, 410,010 XP (Lv 120 → ~140), 3 better items; music: the waves, each queen and the SECRET have their own track (world-music.js RAIDQ, the owner's files); each queen's realm as a panorama round the arena (images/raid/bg-*); story pages, the chronicle, the result card; tests/world/raidq.test.mjs | a KO in a run still shows the town's KO card too; party bonus, crew board, crown fragments, queen sets, titles, weekly boards, hard mode, per-queen gimmicks, summons (the owner's approved list); open to everyone |
| Growth (api/_world-refer.mjs, world-share.js) | Live | invite link (both rewarded at the friend's Lv 5), 1200×630 share cards | a longer invite quest chain |
| First minutes (world-play.js openMake/askSave/openStart) | Live | play first (b-fm1): character maker → controls → walk/jump/Launchpad → training scammer; the wallet is offered after that first knock-out ("Save your progress") and on the "Your first 5 minutes" card; b-st1: loading steps named (loadbar(k, say)), the maker's 3 heroes side by side on phones, the HUD hidden while the maker is up (body.wp-first) and slid in after, three how-to cards (quickStart; All controls → the guide), the first quest says 'Step through a portal to the Utility Village', no 'Player' tag before naming, the locked skill slot says '🔒 Lv N', spawn spots face away from the snack stall; b-st2: the loading screen (play.html: the games' key art images/load/key-31…34 in the turn, the logo, tips as cards, a sharper middle; the little planet grows the plaza's fountain and 4 portals, world-loading3d.js), a landing beam + a first visit's welcome (welcomeBurst, then the maker 1.5 s later), the dancing fountain (world-arcstyle.js makeArcFountain: 12 arcing jets, patterns every 12 s, the music's beat, ripples, a night ring; burst(sec) on arrival and on the hour), portals with a light column + motes and floor light lines from the fountain (world-lands.js), a pull flash, hero greetings + colour shimmer in the maker, the start's camera swing (startSweep), fireflies at night (world-ambient.js), the phone top row (brand + level in one row); b-st3: the funnel in diag (world-diag.js funnel, api/_world.mjs kind "funnel": open → ready → maker → named → start → move → fight → game, and back on another day; new browsers apart; ?world=diag funnel by day), the fountain coin (once a Seoul day, 10 ARCL: arcl-claim "fountain", worldArclFount), the events pill (plazaEvents: fountain show hourly, Jurassic boss 12:00/20:00 KST, Sit & Go even UTC hours, Pumpkin night), welcome back + 'Back to where I left' (arc.world.lastpos), the loading waiting room (online, next events, hero pick → arc.world.prepick), the Starter title (ACH 'starter' = every 'Your first 5 minutes' step; the card waits a minute after the how-to), launch fireworks (a coin in the last 15 min), town folk wave, the far grounds built behind the loading screen on computers | load time on slow phones; measure drop-off per step |
| Game World site (game.html at /game, gw.js, gw.css; the gate arc-gate.js) | Live | the gate's Game World door opens it, its Skip goes straight to /play; the trailer (images/gw/hero-*.mp4) behind PLAY FREE, playing now + visitors (world-ping / ?world=stats), news, the 8 games, the 3 heroes (the owner's art), features, how to play, guide, KPI targets with live numbers, plan, events, notices, play policy; en default + ko/zh/tr | keep its news/notices/events lists in gw.js current with each release; policy text is a draft for the owner |
| Coins page (coins.html at /coins, coins.js, coins.css, api/_world-coins.mjs) | Live | $ARCIRCLE & ARCL explained (what each is, where to earn/spend/use, how they connect, FAQ, the planned $ARCL fee), live numbers: $ARCIRCLE price/mcap/holders/burned/circulating/burns by source/buybacks (?token=arcircle, ?supply=arcircle, read from Arc) and the game's side (?world=coins: ARCL earned/spent by day and kind from the ledger, market sales, exchange totals both ways, $ARCIRCLE paid in the game and half burned, LAND sold); en/ko/zh/tr; linked from /game's footer | ARCL totals start with the ledger (b-ec1) — older movements were never totalled |
| Map · Menu · Character look (world-play.js decorateMap / paintHub, world-rpg.js, world-skin.css; images/ui/map, menu, char — cut from the owner's mock-ups, 2026-10-23) | Live | the Character / Forge / Adventure / Collection / Community window (2026-10-24, the owner's Word file + mock-ups: world-rpg.js paint, SECS / SIDE, .hb-* in world-skin.css; images/ui/menu2 — ARON art cut from the mock-ups, the three heroes standing: stand-*.webp): a bar of sections (Inventory lives in Character → Equipment), a side menu, ARCL + $ARCIRCLE balances with their logos; Character: Overview / Equipment (the lit stage, slot columns, bag, weapon, stats, gear set) / Skills / Titles (every title, worn on a gold plate) / Costumes; Forge: Craft / Enhance / Fuse / Repair / Shop / Sell as a grid + a detail card with the gold button; Adventure: map, daily, achievements, season, events; Collection: overview cards; Community: a hub (quick actions, friends online first via chatUI.friendsList, players here now from ghosts.named() with party invite, chat lines, top 5) + rankings, crew, friends, invite; phones: sections under the brand, side menu top-left beside the art; 2026-10-25 (the owner's idea list, "다 진행하자"): power + a Today card on Overview, the bag shows what you hold (+ search, sort by rarity/level/slot, select several to sell/salvage), craft lists what you can make first, effects (world-rpg.js fx: text, sparks, a ring over what changed — enhance/fuse/equip ▲power/buy/sell/title/skill), pane slide-in, the gold button sticky on phones, the last pane remembered (arc.world.hbLast); Adventure: WEEKLY missions (world-quests.js WEEKLY / WEEKLY_CHESTS, saved in rpg.x.wk, Monday reset Seoul, rewards XP/scrap/potions/gear — no ARCL; game starts count via quests.bump("game")), the world bosses board (world-play.js bossList: Jurassic boss hour, Inferno Jack, the raid, each ground's boss; live/when, rewards, go there), the login-streak week on Daily (world-shop.js streak()); Collection: overall progress + set bonuses; map: header art, the minimap key folded, section chips that jump, cards with each place's art; menu: header art, Recent as art cards (≤3, none of the nine), the nine as 3D icons, More as icon rows (Recent not repeated), the small things as pills; character: a lit stage under the hero, stat icons, round skill icons, worn gear lit | art for the places that have none yet (hunting grounds, Nexus City, Research/ARCIA halls) |
| Platform & ops (world-diag.js, world-shell.js, tools/world-walk) | Live | diag counters (?world=diag), PC window mode, stale-chunk reload, loading watchdog, 4 languages (en/ko/zh/tr); the town's day and night follow US Eastern time (world-play.js etHour, the owner's call 2026-10-23: night 20:00–05:00 there, like the Pumpkin Kings; ?hour= to try) — the weekend 2×, concert night and Jurassic's 6-hour cycle still run on Seoul time | — |

Game count for the KPI: 8 in the Games list (Jurassic, Survivors, Poker+Blackjack, Rings, Mine, Defense, Coin Jump,
Beat Stomp), plus the hoverboard race in town.
