# 25: Wire weekly storage and the system clock

**Iteration:** 3 (Weekly storage)

## Description
Replace `TotalsStore` (#19) with `BudgetStore`. Add the `systemClock` adapter (`now()` plus `Intl.DateTimeFormat().resolvedOptions().timeZone`). Run `prune` on activation. The footer now shows the real reset day and the pace warning. Totals from iteration 2 are pre-release data and are deliberately dropped: remove the old key on activation.

## Tests to write first
*(integration)*
- `systemClock returns a valid IANA time zone`
- `handleRequest records usage under the current week key in globalState`
- `footer shows the weekday of the next reset`
- `usage persists across deactivate/activate`
- `activation removes the iteration 2 totals key`
- `activation prunes week keys older than 12 weeks` (seeded via the test API)

## Implementation tasks
- [ ] `src/adapters/systemClock.ts`
- [ ] Update the composition root and test API
- [ ] Update `docs/manual-testing.md`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green with a `.vsix` artifact
- [ ] Manual: chat, check that the footer says "this week · resets Mon", reload the window and see the total kept

## Depends on
#19, #21, #23, #24

## Labels
`feature`

## Estimate
S
