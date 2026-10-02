# ARCIRCLE Orders on Solana

`arcircle-orders/` is the Solana program behind the Solana side of ARCIRCLE Orders (`arc-orders-sol.js` on the page,
`api/_orders-sol.mjs` on the server, the client in `tools/pump-kit/orders-sol.mjs`).

## How it works

- **Nothing is deposited.** An order is a program account (`["order", owner, nonce]`). In the same transaction the owner
  approves the program's `auth` PDA as the SPL delegate of the source account, for that order's amount (wrapped SOL for
  a buy, the token for a sell; SPL Token and Token-2022).
- **A fill is one transaction:** `fill_start` moves the input to the filler (a buy's 0.1% fee to the treasury's wSOL
  first) → the filler swaps (the keeper uses Jupiter) and pays the owner → `fill_end` checks the owner's output went up
  by at least `min_out` (and, on a sell, that the treasury got 0.1% of `min_out` in SOL), then closes the order with its
  rent back to the owner. `fill_start` refuses unless the same transaction ends with that order's `fill_end`, and a
  transaction may hold only one fill — so the owner gets at least their price or nothing moves. The filler isn't trusted.
- The **admin** (the upgrade authority at `init_config`) sets the keeper (or leaves filling open), the fee (≤ 1%), a cap
  per order (lamports) and a pause. `cancel` by the owner; `close_expired` by anyone after an order's expiry.

Tests (local validator): placement, buy and sell fills (Token-2022 included), the owner one unit short, a fill without
its `fill_end`, two fills in one transaction, a `fill_end` for another order, paying into someone else's account, the
keeper rule, caps, pause, expiry, cancel. The keeper was run end to end against the program with Jupiter mocked.

**Not audited.** Keep the per-order cap small at first.

## Deploying (from a Codespace)

1. Install the Solana CLI: `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`, then open a new terminal.
2. Make the program's keypair and note its address (the program id):
   `solana-keygen new -o ~/arcircle-orders-program.json` → `solana-keygen pubkey ~/arcircle-orders-program.json`
3. The binary is built for that id: `./arcircle-orders/build.sh <PROGRAM_ID>` (needs `cargo-build-sbf`, part of the CLI;
   `Cargo.lock` pins the versions the platform tools can build) — or ask for a build with that id.
   `deploy/SHA256` lets anyone check the deployed bytes match.
4. Deploy from the wallet that will be the upgrade authority (≈ 2.6 SOL of rent for a ~366 KB program):
   `solana program deploy arcircle-orders/deploy/arcircle_orders.so --program-id ~/arcircle-orders-program.json --keypair <deployer.json> --url <RPC>`
5. A keeper wallet for the server: `solana-keygen new -o ~/arcircle-orders-keeper.json`; send it ~0.05 SOL. Its secret
   (the JSON array in that file) goes in Vercel as **ORDERS_KEEPER_SOL_KEY** (Sensitive).
6. Set up the config, signed by the deployer:
   `node solana/scripts/orders-config.mjs init --program <PROGRAM_ID> --admin <deployer.json> --keeper <KEEPER_PUBKEY> --treasury <TREASURY_PUBKEY> --fee 10 --cap 5 --rpc <RPC>`
7. Vercel env: **ORDERS_SOL_PROGRAM** = the program id, **JUPITER_API_KEY** (portal.jup.ag), **SOLANA_RPC_URL** (one that
   allows `getProgramAccounts`, e.g. Helius). Put the program id in `config-arc.js` → `CONFIG.ORDERS_SOL.PROGRAM` too.
8. cron-job.org, every minute: `https://www.arcircle.app/api/desk?chain=sol&orderstick=1&key=<CRON_SECRET>`

Later changes: `node solana/scripts/orders-config.mjs set --program <ID> --admin <deployer.json> [--pause|--resume] [--cap 10] [--keeper <PUBKEY>|open] [--fee 10]`;
`show` prints the config.
