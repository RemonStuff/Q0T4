# 19: globalState storage adapter and budget enforcement wiring

**Iteration:** 2 (Counting and the hard stop)

## Description
Make iteration 2 installable. Add the `globalStateStorage` adapter (`StoragePort` over `ExtensionContext.globalState`) and a simple `TotalsStore` (one running total per subject, **not weekly yet**, replaced in #25). Wire counting, the pre-check, StreamGuard, the recording policy and the footer into the participant. For now every prompt goes to a single subject, `general`, with a 200k default limit (from a `DEFAULT_SUBJECTS` constant in core). Settings arrive in #26.

Issue #14 adds an optional core-handler `BudgetContext` for the subject, active
`CostModel`, used cost, budget, optional allowance and reset label. That gate
counts complete messages and pre-checks only when context is supplied. The
installed participant still supplies none. This issue owns the real
storage-backed state and composition-root activation in `extension.ts`, not a
second pre-check implementation. Refusal metadata from #14 reports no charged
usage or answering model; full usage metadata is defined by #18.

## Tests to write first
*(unit)*
- `TotalsStore adds usage to the subject total`
- `TotalsStore returns 0 for an unknown subject`

*(integration)*
- `globalStateStorage get/set/keys round-trip through ExtensionContext.globalState`
- `handleRequest appends a footer with the usage this request`
- `handleRequest stops a long fake reply with ⛔ when the budget is tiny` (test hook to override the limit)
- `handleRequest refuses before calling the model when the total is already at the limit`
- `usage persists across a deactivate/activate cycle`

## Implementation tasks
- [ ] `src/adapters/globalStateStorage.ts`
- [ ] `src/core/storage/totalsStore.ts`
- [ ] Wire into `extension.ts`. The test API exposes `store` and a limit override.
- [ ] Update `docs/manual-testing.md`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green with a `.vsix` artifact
- [ ] Manual: chat with `@q0t4` and see the footer increase; temporarily lower `DEFAULT_SUBJECTS.general` in a dev build and check the refusal and the ⛔ cut-off by hand

## Depends on
#14, #15, #16, #18

## Labels
`feature`

## Estimate
M
