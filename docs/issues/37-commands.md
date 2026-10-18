# 37: Commands: Show Usage, Reset This Week, Edit Subjects

**Iteration:** 5 (Visibility)

## Description
Three palette commands:
- **Q0T4: Show Usage** (`q0t4.showUsage`): opens a markdown preview of the `/status` table in a read-only untitled document, or a quick pick. The decision goes in the PR.
- **Q0T4: Reset This Week** (`q0t4.resetWeek`): a **modal** confirmation through `UiPort.confirm`, then clears the current week's usage for all subjects. Earlier weeks aren't touched.
- **Q0T4: Edit Subjects** (`q0t4.editSubjects`): opens Settings filtered to `q0t4.subjects`.

## Tests to write first
- `resetWeek does nothing when the user cancels the confirmation`
- `resetWeek clears only the current week after confirmation`
- `resetWeek refreshes the status bar`
- `resetWeek confirmation text names the week dates`
- `showUsage renders the same content as /status`
- `editSubjects asks the UI to open settings for q0t4.subjects`
- *(integration)* `all three commands are registered and appear in package.json contributes.commands with the "Q0T4" category`
- *(integration)* `resetWeek with a stubbed confirm clears globalState for the current week`

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
