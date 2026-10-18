# 41: README, packaging and release workflow

**Iteration:** 6 (Hardening and release)

## Description
Make Q0T4 releasable. Write a README that explains what the extension does, how subjects are detected, every setting, and the **known limits**:
- Inline completions, agent mode and the normal Copilot chat aren't counted
- Token counts won't exactly match how GitHub meters Copilot (premium requests, hidden prompts, framing overhead)
- The cut-off can overshoot by one recount interval
- Subjects come from the repo's git remote (`owner/repo`), falling back to the folder name, so a folder copied without `.git` gets its own budget
- Usage is stored per machine

Finish the marketplace metadata, add a CHANGELOG, and add a tag-triggered release workflow that attaches the `.vsix` to a GitHub Release.

## Tests to write first
- `package.json has displayName "Q0T4", an icon, categories, a repository URL and engines matching @types/vscode` (unit test reading package.json)
- `every q0t4.* setting in package.json is documented in the README` (unit test cross-checking both files)
- `every contributed command is documented in the README`
- *(CI)* `release workflow dry run on a pre-release tag produces a .vsix`

## Implementation tasks
- [ ] README.md: overview, quick start, how subjects work, settings table, commands, known limits, privacy (nothing leaves the machine except normal model requests), development and TDD guide
- [ ] CHANGELOG.md (Keep a Changelog format), LICENSE
- [ ] Final icon (`images/icon.png`, 128×128)
- [ ] `.github/workflows/release.yml` on `v*` tags: run the full CI, `vsce package`, create a GitHub Release with the `.vsix`
- [ ] Marketplace / Open VSX publishing steps, only if open question 9 says so

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green
- [ ] Manual: run the full `docs/manual-testing.md` checklist against the release-candidate `.vsix` in a clean VS Code profile

## Depends on
#38, #39, #40

## Labels
`docs`, `infra`

## Estimate
M
