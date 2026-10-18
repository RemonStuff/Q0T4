# 23: `Ledger` resilience: corrupt lines, retention, settings changes

**Iteration:** 3 (Weekly storage)

## Description
Never crash because of what's in the ledger, and keep it bounded:
- unparseable or invalid lines are skipped, counted, and reported once
- month folders older than 13 months are pruned on activation
- totals stay correct when `resetDay` changes mid-week, because usage is summed by date range rather than stored per week

## Tests to write first
- `skips an unparseable line and still sums the valid ones`
- `skips a line that fails isLedgerEntry and counts it`
- `reports corrupt lines once per session, not on every read`
- `an entry with an unknown future schema version is skipped, not misread`
- `prune removes months older than 13 months and keeps the rest`
- `prune never touches the current month`
- `changing resetDay from monday to wednesday mid-week counts exactly the entries inside the new window`
- `no entry is ever counted twice when windows overlap after a resetDay change`

## Implementation tasks
- [ ] Defensive parsing in `Ledger` reads
- [ ] `prune(now)` through `LedgerPort.removeMonth(month)`
- [ ] `InMemoryLedger` support for injected corrupt lines (from #04)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#22

## Labels
`feature`

## Estimate
S
