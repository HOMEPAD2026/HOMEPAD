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
