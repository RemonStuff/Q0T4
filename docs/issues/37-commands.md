# 37: Commands: Show Usage, Reset This Week, Edit Subjects

**Iteration:** 5 (Visibility)

## Description
Three palette commands:
- **Q0T4: Show Usage** (`q0t4.showUsage`): opens a markdown preview of the `/status` table in a read-only untitled document, or a quick pick. The decision goes in the PR.
- **Q0T4: Reset This Week** (`q0t4.resetWeek`): a **modal** confirmation through `UiPort.confirm`, then appends a `reset` marker to the ledger for every subject. The ledger is append-only, so nothing is deleted: weekly totals count only entries after the latest marker. Earlier weeks aren't touched, and **cycle totals in credits mode ignore the marker**, because those credits were really spent ([PLAN §4](../PLAN.md#4-data-model-an-append-only-ledger)).
- **Q0T4: Edit Subjects** (`q0t4.editSubjects`): opens Settings filtered to `q0t4.subjects`.

## Tests to write first
- `resetWeek does nothing when the user cancels the confirmation`
- `resetWeek appends a reset marker per subject after confirmation, and weekly totals drop to 0`
- `resetWeek leaves earlier weeks unchanged`
- `resetWeek does not lower cycle totals in credits mode`
- `resetWeek refreshes the status bar`
- `resetWeek confirmation text names the week dates`
- `showUsage renders the same content as /status`
- `editSubjects asks the UI to open settings for q0t4.subjects`
- *(integration)* `all three commands are registered and appear in package.json contributes.commands with the "Q0T4" category`
- *(integration)* `resetWeek with a stubbed confirm writes reset markers to the ledger file`

## Implementation tasks
- [ ] `src/core/commands.ts`: pure command logic over ports
- [ ] `UiPort.confirm` / `openSettings` / `showDocument` in the `vscodeUi` adapter
- [ ] Register the commands in `extension.ts`
- [ ] Update `docs/manual-testing.md`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green with a `.vsix` artifact
- [ ] Manual: run each command from the palette; Reset asks first and Cancel keeps usage

## Depends on
#36

## Labels
`feature`

## Estimate
M
