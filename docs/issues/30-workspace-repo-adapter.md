# 30: `WorkspacePort` and the git workspace adapter

**Iteration:** 4 (Repo subjects)

## Description
Find out which repo the user is working in. `WorkspacePort.currentRepo()` returns `{ folderName, remotes: { name, url }[] } | undefined`. The `workspaceRepo` adapter:
- **Picks the folder:** the workspace folder of the active text editor, otherwise the first workspace folder, otherwise `undefined`
- **Reads remotes:** from VS Code's built-in Git extension (`vscode.extensions.getExtension("vscode.git")?.exports.getAPI(1)`), matching the repository whose root contains that folder. It waits for the Git API to finish initialising, with a short timeout.
- **Degrades gracefully:** if the Git extension is disabled or the folder isn't a git repo, it returns the folder with no remotes

Only the minimal Git API types are copied into `src/adapters/git.d.ts`. No runtime dependency is added.

## Tests to write first
*(unit, with a FakeWorkspace)*
- `FakeWorkspace returns the configured repo info`
- `FakeWorkspace returns undefined when configured with no folder`

*(integration)*
- `returns undefined when no folder is open`
- `returns the folder name and origin remote for a git repo with a remote` (fixture: temp dir with `git init` and `git remote add origin https://github.com/test-owner/test-repo.git`, opened as the workspace)
- `returns the folder name and no remotes for a git repo without remotes`
- `returns the folder name and no remotes for a folder that is not a git repo`
- `in a multi-root workspace, picks the folder of the active editor`
- `returns no remotes, without throwing, when the Git API is unavailable` (adapter constructed with a missing extension)

## Implementation tasks
- [ ] `WorkspacePort` in `src/ports/`, plus `FakeWorkspace` in `test/fakes/`
- [ ] `src/adapters/git.d.ts` (subset: `API`, `Repository.rootUri`, `Repository.state.remotes`)
- [ ] `src/adapters/workspaceRepo.ts`
- [ ] Integration fixture that creates temporary git repos (the `git` CLI is available on CI runners)

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green

## Depends on
#27

## Labels
`feature`

## Estimate
M
