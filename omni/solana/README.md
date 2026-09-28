# ARCIRCLE on Solana (LayerZero OFT program)

Solana gets a **mint/burn OFT with zero starting supply**. Every ARCIRCLE on Solana was locked on Arc (or burned
on Robinhood) first. Two flags make or break that:

| Flag | Value | Why |
|---|---|---|
| `--only-oft-store` | `true` | Only the OFT Store (driven by LayerZero messages) can ever mint. **Irreversible — this is what we want.** |
| `--amount` | **leave it out** | Any amount here is minted out of thin air on Solana and breaks the 1,000,000,000 cap. |
| `--local-decimals` | `6` | SPL balances are u64; 6 keeps 1B × 10⁶ far below the limit and matches shared decimals. |
| `--shared-decimals` | `6` | Same on every chain (the EVM contracts default to 6). |

Commands follow LayerZero's `examples/oft-solana` (scaffold with `LZ_ENABLE_SOLANA_OFT_EXAMPLE=1 npx create-lz-oapp@latest`,
choose "OFT (Solana)"). Check every flag with `--help` on the version you install — the CLI evolves.

1. **Build and deploy your own OFT program** (you keep its upgrade authority; move it to a Squads multisig after):
   ```
   anchor keys sync
   anchor build -v -e OFT_ID=<OFT_PROGRAM_ID>
   solana program deploy --program-id target/deploy/oft-keypair.json target/verifiable/oft.so -u mainnet-beta --with-compute-unit-price <MICRO_LAMPORTS>
   ```
2. **Create the ARCIRCLE mint + OFT Store** (no `--amount`):
   ```
   npx hardhat lz:oft:solana:create --eid 30168 --program-id <OFT_PROGRAM_ID> --only-oft-store true --local-decimals 6 --shared-decimals 6
   ```
   This writes `deployments/solana-mainnet/OFT.json` (`oftStore`, `mint`, …). `layerzero.config.ts` reads the OFT Store from it.
3. **Init the Solana side of the config**, then wire all three chains from the repo root:
   ```
   npx hardhat lz:oft:solana:init-config --oapp-config layerzero.config.ts
   npx hardhat lz:oapp:wire --oapp-config layerzero.config.ts
   ```
4. **Rate limits on Solana**: set outbound/inbound limits per peer (the Solana OFT program supports them in its
   peer config) to the same daily amount as the EVM side.
5. **Hand over**: OFT Store admin, delegate and program upgrade authority → the Solana multisig (Squads).
6. **Metadata**: name `arcircle`, symbol `ARCIRCLE`, logo = the ARCIRCLE mark, so wallets and Jupiter show it right.

Test a small amount both ways (`lz:oft:send`) before announcing:
```
npx hardhat lz:oft:send --src-eid 30417 --dst-eid 30168 --to <SOLANA_WALLET> --amount 1
npx hardhat lz:oft:send --src-eid 30168 --dst-eid 30417 --to <EVM_WALLET> --amount 1
npx hardhat omni:supply
```
