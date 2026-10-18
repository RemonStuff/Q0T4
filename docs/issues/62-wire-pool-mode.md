# 62: Wire pool mode end to end

**Iteration:** 8 (Pool, reserve and sync)

## Description
Connect the cycle calendar, rolling weekly budgets, pool settings, reserve borrowing, pace warnings, `/sync` and the pool UI through the participant and commands. Recompute budgets when pool settings change, applied from the next week (#55). Register `/sync` and `q0t4.allowReserve`.

## Tests to write first
*(integration; fake model provider, local price server, FixedClock test hook)*
- `with pool 35,000 and two repos with shares, each repo's first weekly budget follows the formula`
- `spending past the weekly budget with reserveMode "ask" offers the button, and after allowing it the re-sent prompt borrows`
- `reserveMode "auto" borrows and records it in the ledger file`
- `/sync books untracked usage and the reserve shrinks in /status`
- `moving the test clock past the week start creates a new budget snapshot`
- `moving the test clock past the cycle start resets cycle usage and the reserve`
- `two extension hosts (two writer IDs) computing the same week get the same budget`

## Implementation tasks
- [ ] Composition-root wiring and test hooks (clock override)
- [ ] Update `docs/manual-testing.md` (pool section)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green with a `.vsix` artifact
- [ ] Manual: configure your real pool (35,000, cycle start day, shares), chat in two repos, check the footer and `/status`, run `/sync` with GitHub's figure, and check the untracked and reserve lines

## Depends on
#61

## Labels
`feature`

## Estimate
M
