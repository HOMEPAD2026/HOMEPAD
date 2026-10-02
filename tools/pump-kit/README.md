# tools/pump-kit → vendor/pump-kit.js

The Solana side of ArcPad × Pump.fun (`arc-pump.js`): the parts of `@solana/web3.js`, `@solana/spl-token` and the
official `@pump-fun/pump-sdk` the launch page uses, plus the three transactions it signs (`entry.mjs`). Bundled once
into `vendor/pump-kit.js` (≈1 MB, ≈245 KB gzipped) and loaded only when someone picks Pump.fun on the Launch tab.
Nothing here is deployed except the built file.

    cd tools/pump-kit && npm install && npm run build

After a rebuild, set the new file's hash in `config-arc.js` (`CONFIG.PUMP.KIT`, `?v=`) so browsers fetch it again:

    sha256sum vendor/pump-kit.js | cut -c1-10
