# 23: `BudgetStore` resilience: pruning, corruption, resetDay changes

**Iteration:** 3 (Weekly storage)

## Description
Keep storage bounded and never crash because of what's in it. Prune week keys older than 12 weeks. Move values that fail validation to `q0t4.usage.corrupt.<timestamp>` and treat them as empty. Make sure changing `resetDay` mid-week neither loses nor double-counts usage, which works because usage is summed per day across the window.

## Tests to write first
- `prune removes week keys older than 12 weeks`
- `prune keeps the current and the 11 previous weeks`
- `prune ignores keys that are not q0t4 usage keys`
- `a corrupt week value is quarantined and treated as empty`
- `an unknown schema version is quarantined, not overwritten silently`
- `changing resetDay from monday to wednesday mid-week keeps usage recorded since Wednesday`
- `changing resetDay never double-counts a day present in two week keys`

## Implementation tasks
- [ ] `prune(now)` and `quarantine(key, value)` in BudgetStore
- [ ] Run `prune` on activation (wired in #25)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#22

## Labels
`feature`

## Estimate
S
