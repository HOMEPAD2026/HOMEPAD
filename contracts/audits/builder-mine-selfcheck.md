# BuilderMine v2 — self-check before deploying

Not an external audit. What was run, what it found, and what changed.

## Tests

- `test/builder-mine.test.js` — 19 unit tests: fees, pause, info, the curve, top-ups, roots, claims, claimMany,
  burns, owner powers, items, boosts.
- `test/builder-mine.invariant.test.js` — random play. Mines open, get topped up (plain and 3%-tax tokens),
  builders join and buy items, the operator posts roots (a greedy root over the schedule is tried every time and
  must fail), builders claim (an inflated amount is tried every time and must fail), leftovers burn, time jumps
  from a minute to twenty days. After every step:
  - claimed ≤ rootTotal ≤ emittedAt(now) ≤ deposited, for every mine
  - claimed + burned ≤ deposited, and = deposited once a mine is closed
  - emittedAt(end) = deposited exactly
  - the contract holds at least what it owes in every token
  - every $ARCIRCLE paid sits at 0x…dEaD and equals `arcircleBurned`; the contract keeps none
  - a claim pays exactly cumulative − already claimed
  - after every window, every mine burns down to exactly zero
  Default 4 seeds × 70 steps; `FUZZ_RUNS=40 FUZZ_STEPS=120 FUZZ_SEED=9000` passed (40 × 120 steps).

## Slither 0.11 (all detectors)

| Finding | Verdict |
|---|---|
| missing zero-check on `operator` | fixed — constructor and `setOperator` refuse the zero address |
| `OperatorSet` address not indexed | fixed |
| `until` left uninitialised in `buyItem` | made explicit (0 for pickaxes) |
| divide-before-multiply in `_f` | intended — a run is whole days, so `(end − start) / 6` is exact |
| strict equality `got == 0` in `_pull` | intended — refuses deposits that arrive as nothing |
| block.timestamp comparisons | intended — the schedule is time-based; a validator's few seconds don't matter at hour scale |

## Found by review and fixed

- **Dust top-ups.** Anyone may top up and a mine has 16 top-up slots, so 16 top-ups of 1 wei could have locked the
  creator out. A top-up must now be at least 1% of the first deposit (`MIN_TOPUP_BPS`).
- **Boosts bought before a mine opens** used to start ticking at purchase and could run out before any mining.
  They now start when the mine opens; the seven-day stacking limit counts from then.

## Known and accepted

- The fee is priced from the pool's current `slot0`. It can be moved inside one transaction, but the fee is
  1 USDC, and `feeFloorArc` sets a minimum. Revisit (TWAP) before raising the fee.
- The operator key can post any root up to what the schedule has released. Posting is capped by `emittedAt`,
  and claims are capped by each mine's `rootTotal`, so one mine's roots can never pay out another mine's tokens.
