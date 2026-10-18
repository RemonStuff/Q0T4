# 06: GitHub Actions CI

**Iteration:** 0 (Test harness)

## Description
Every push and pull request runs lint, typecheck, unit tests with enforced core coverage, integration tests under xvfb, and packaging. CI exists before any feature work. Also add the bug issue template that enforces "every bug fix starts with a failing test".

All work happens on its own branch and reaches `main` through a pull request (see [PLAN §8](../PLAN.md#8-branches-and-pull-requests)). **Documentation branches (`docs/**`) don't run the automated tests.**

## Tests to write first
CI configuration can't be unit tested in any useful way. Instead, prove each gate goes red, on a throwaway branch:
- `CI fails on a lint error`
- `CI fails when core coverage drops below 90%`
- `CI fails when an integration test fails`
- `CI passes on main`
- `CI does not run tests for a push to a docs/ branch`
- `CI skips test jobs on a PR whose head branch is docs/...` (the jobs show as skipped, which still counts as passing for branch protection)

## Implementation tasks
- [ ] Triggers that skip docs branches:
  ```yaml
  on:
    push:
      branches-ignore: ["docs/**"]
    pull_request:
  jobs:
    check:
      if: ${{ !startsWith(github.head_ref, 'docs/') }}
  ```
  `pull_request` can't filter on the head branch, so every job carries the same `if:` guard.
- [ ] `.github/workflows/ci.yml` jobs:
  - `check` (ubuntu): `npm ci`, lint, typecheck
  - `unit` (matrix of ubuntu-latest and windows-latest): `npm run coverage`, uploading the coverage report
  - `integration` (ubuntu): `xvfb-run -a npm run test:integration`, caching `.vscode-test/`
  - `package` (needs all of the above): `npx @vscode/vsce package`, uploading `q0t4-*.vsix` as an artifact
- [ ] `.github/ISSUE_TEMPLATE/bug.md` with a required "Failing test that reproduces it" section
- [ ] `.github/pull_request_template.md` with a red → green → refactor checklist
- [ ] CI badge in the README stub

## Acceptance criteria
- [ ] Each "fails on…" case was seen red once (link the runs in the PR)
- [ ] CI is green on `main`
- [ ] Manual: download the `.vsix` artifact from a run

## Depends on
#02, #05

## Labels
`infra`

## Estimate
S
