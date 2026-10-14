# World tests

Plain Node scripts, no test runner. Each prints `PASS` / `FAIL` lines and a count, and exits with 1 when anything failed.

- `game.test.mjs`: the game's rules (season, quiz, fusion, the raid's phases and weekly twist, its calendar reminder, the codex). No dependencies.
- `sfx.test.mjs`: the sound effects (world-sfx.js) without a browser: safe before the first tap, footsteps only while running. No dependencies.
- `world-api.test.mjs`, `shop.test.mjs`, `social.test.mjs`, `support.test.mjs`: the World API (`api/_world*.mjs`) against an in-memory store, signing with throwaway wallets. They need `ethers` 6 and the repo's own dependencies (`npm install`, then `npm install --no-save ethers@6`).

`tools/world-tests.workflow.yml` runs all of them in GitHub Actions once it's copied to `.github/workflows/`.
