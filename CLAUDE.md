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
- Close with `♾️ ARCIRCLE WORLD — Play. Build. Battle. Earn.`, then `🌐 https://arcircle.app/play`,
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

🌐 https://arcircle.app/play

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

## Before saying a game change is done (checklist)

The owner tests on a real Android phone (Samsung Internet), signed in with a wallet, at high level. Headless desktop
Chrome as a guest is not enough. Before reporting a change to ARCIRCLE World as finished:

- Run every tests/world/*.test.mjs, then rebuild (bump-cache.sh + tools/build-bundles.mjs) and load play.html.
- Screenshot the change on the phone layout (390x844, touch: the 980px-wide `wp-pcphone` page) and on desktop.
- Walk the whole flow, not one frame: enter → play → leave → enter again (twice). Check the HUD isn't covered by the
  minimap, wallet/purse row, quest card or joystick.
- Think through the paths the test can't take: signed in (server calls), level 90+, a second run in the same session,
  a failed dynamic import or start. Nothing may fail silently: show a short error toast and reset state.
- Say plainly what was and wasn't verified (e.g. "not checked signed-in on a real phone").
- A deploy replaces /w/ and its content-hashed chunks: a page opened before the deploy asks for chunk names that are
  gone. /w/ keeps the last 3 builds' chunks (tools/build-world.mjs, w/.gens.json) and world-play.js reloads itself
  once when a lazy chunk fails (staleReload) — never remove either. When testing, also simulate "page opened, then a
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

## Our 2026 goals (KPIs for December 31, 2026 — the owner's targets, not guarantees)

1. Registered players: 10,000+
2. Peak concurrent players: 100+
3. $ARCIRCLE market cap: $5M+
4. Game releases: 10+ playable games
5. Partnerships & investment: 3+ signed agreements

The vision behind them: the Roblox of crypto. When planning or writing posts, weigh work by what moves these (new
players signing up, reasons to play together at the same time, more playable games). Always call them targets, never
promises.
