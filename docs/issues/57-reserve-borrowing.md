# 57: Reserve borrowing: auto, ask and off

**Iteration:** 8 (Pool, reserve and sync)

## Description
The reserve is a cycle-level pot. When a request doesn't fit a subject's remaining weekly budget ([PLAN §9.3](../PLAN.md#93-pool-shares-and-reserve)):
- **`auto`:** the pre-check and StreamGuard get `extraAllowance = reserveRemaining` (the hooks from #14 and #15). The ledger entry records `borrowed`, the overflow above the weekly budget, and the footer adds ⚠️ "borrowed N from reserve".
- **`ask`:** the request is refused with a chat button, **Allow reserve for <repo> this week** (`q0t4.allowReserve`), which appends a `reserve-grant` entry for that subject and week. A followup re-sends the original prompt. With a grant, the subject behaves like `auto` for the rest of the week.
- **`off`:** a plain refusal.

`reserveRemaining = reserve − Σ borrowed − Σ untracked charged to the reserve (#59)`. Reserve-backed subjects (`unallocatedSubjects: "reserve"`) always borrow, under the same mode rules.

## Tests to write first
*(each runs for tokens and credits)*
- `auto: a request over the weekly budget runs and records the overflow as borrowed`
- `auto: borrowed never exceeds reserveRemaining, and the cut-off stops at weekly budget + reserve`
- `auto: when the reserve is empty, the request is refused like "off"`
- `ask: refuses with an Allow reserve button and a followup that re-sends the prompt`
- `ask: after a grant, the same subject borrows for the rest of the week`
- `ask: a grant does not apply to other subjects or the next week`
- `off: refuses without offering the reserve`
- `a reserve-backed subject borrows from the first request`
- `a blocked subject is refused with a link to settings`
- `reserveRemaining subtracts borrowed and reserve-charged untracked entries for the current cycle only`

## Implementation tasks
- [ ] `src/core/budget/reserve.ts`
- [ ] The `reserve-grant` ledger kind, and the `q0t4.allowReserve` command (pure logic in core)
- [ ] A `button` and followup in the refusal (`ChatOutputPort.button` from #35, `ChatResult` followups)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#14, #15, #56

## Labels
`feature`

## Estimate
M
