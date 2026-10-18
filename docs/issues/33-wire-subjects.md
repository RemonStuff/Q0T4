# 33: Wire repo subjects end to end

**Iteration:** 4 (Repo subjects)

## Description
Connect subject resolution, per-repo limits (configured or `defaultLimit`) and same-subject history through the participant. Reload the config on change. Show `parseConfig` warnings once per change through `UiPort.showInfo`.

## Tests to write first
*(integration, fake provider plus a temporary git repo opened as the workspace)*
- `a prompt in a repo with origin test-owner/test-repo is charged to test-owner/test-repo`
- `the footer names the repo subject and its limit`
- `an unlisted repo gets defaultLimit`
- `a repo listed in q0t4.subjects gets its configured limit`
- `a follow-up prompt stays on the thread subject`
- `/use general charges the prompt to general and the thread keeps general`
- `exhausting one repo's budget refuses it, while /use general still works`
- `changing q0t4.subjects at runtime takes effect on the next request`

## Implementation tasks
- [ ] Update the composition root, wiring `ConfigPort` and `WorkspacePort` into the handler and the `Ledger`
- [ ] A minimal `vscodeUi.showInfo` adapter (expanded in #36)
- [ ] Update `docs/manual-testing.md`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green with a `.vsix` artifact
- [ ] Manual: open this repo, chat, and see `RemonStuff/Q0T4` in the footer; set its `weeklyLimit` to 2000 and chat until refused; `/use general` still answers; open a folder that isn't a repo and see the folder name as the subject

## Depends on
#31, #32

## Labels
`feature`

## Estimate
M
