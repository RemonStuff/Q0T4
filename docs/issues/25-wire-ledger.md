# 25: Wire the ledger: file adapter and system clock

**Iteration:** 3 (Weekly storage)

## Description
Replace `TotalsStore` (#19) with the `Ledger`. Add the adapters:
- **`fileLedger`:** `LedgerPort` over JSON Lines files in `ExtensionContext.globalStorageUri/ledger/<YYYY-MM>/<writerId>.jsonl`, where `writerId = vscode.env.sessionId`. Each window appends only to its own file, so no lock is needed ([PLAN §9.5](../PLAN.md#95-ledger-and-concurrency)). Reads merge every file in the requested months, with a small cache keyed on size and mtime. It uses `node:fs/promises` (`appendFile`), because `workspace.fs` can't append.
- **`systemClock`:** `now()` plus `Intl.DateTimeFormat().resolvedOptions().timeZone`.

Run `prune` on activation. The footer now shows the real reset day and the pace warning. Totals from iteration 2 are pre-release data and are deliberately dropped: remove the old globalState key on activation.

## Tests to write first
*(integration)*
- `systemClock returns a valid IANA time zone`
- `fileLedger appends a line to <month>/<sessionId>.jsonl under globalStorageUri`
- `fileLedger reads entries from several writer files in one month`
- `two writers appending concurrently lose no entries` (two adapter instances with different writer IDs, 100 interleaved appends each)
- `handleRequest records a usage entry in the current month's file`
- `footer shows the weekday of the next reset`
- `usage persists across deactivate/activate`
- `activation removes the iteration 2 totals key`
- `activation prunes month folders older than 13 months`

## Implementation tasks
- [ ] `src/adapters/fileLedger.ts` and `src/adapters/systemClock.ts`
- [ ] Update the composition root and test hooks
- [ ] Update `docs/manual-testing.md`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green with a `.vsix` artifact
- [ ] Manual: chat, check that the footer says "this week · resets Mon", reload the window and see the total kept; open a second window on another repo, chat in both, and check that both totals are right

## Depends on
#19, #21, #23, #24

## Labels
`feature`

## Estimate
M
