# 63: Public API façade: status, canSpend and usage events

**Iteration:** 9 (Public API)

## Description
Expose Q0T4's budgeting to other extensions, first of all a planned multi-repo chat extension ([PLAN §9.8](../PLAN.md#98-public-api)). `activate()` returns `{ apiVersion: 1, forExtension(extensionId) }`. A `Q0T4Client` offers:
- `getStatus()`: the `StatusSnapshot` from #61, with weekly and cycle figures per subject, the reserve, the unit and the price table
- `canSpend(subject, { inputTokens, model? })`: `{ allowed, remaining, wouldBorrow, unit, reason? }`, using the same pre-check and reserve rules as the participant, without recording anything
- `onDidChangeUsage`: fires after any ledger append (from the participant, the API, `/sync` or a reset), with `{ subject, source, cost }`

VS Code doesn't tell an extension who called it, so `extensionId` is **self-declared** and trusted; that's documented. All logic lives in `core/api`, and `extension.ts` only adapts types.

## Tests to write first
- `apiVersion is 1`
- `forExtension returns a client bound to that extension id`
- `forExtension rejects an empty or malformed extension id`
- `getStatus returns the same figures as /status` (shared snapshot)
- `canSpend allows within the weekly budget and reports remaining`
- `canSpend reports wouldBorrow when only the reserve covers it, under reserveMode "auto"`
- `canSpend refuses with a reason when blocked, over budget, or when prices are missing in credits mode`
- `canSpend never appends to the ledger`
- `onDidChangeUsage fires after a participant request, with source "q0t4"`
- `onDidChangeUsage fires after /sync with source "untracked"`
- `listener errors don't break recording`

## Implementation tasks
- [ ] `src/core/api/q0t4Api.ts` and the public types (`StatusSnapshot`, `SpendCheck`, `UsageChange`)
- [ ] A ledger-append event in core
- [ ] Publish the API types as `src/api.d.ts` for consumers to copy

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#62

## Labels
`feature`

## Estimate
M
