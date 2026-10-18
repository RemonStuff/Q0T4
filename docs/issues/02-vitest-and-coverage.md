# 02: Vitest and enforced core coverage

**Iteration:** 0 (Test harness)

## Description
Set up Vitest for fast unit tests of `src/core/**` and v8 coverage with **at least 90% lines and branches** on core. The run fails below that threshold, locally and in CI. Move the lint and typecheck fixture checks from #01 into Vitest.

## Tests to write first
- `vitest discovers tests under test/unit`
- `coverage run fails when core branch coverage is below 90%`: a throwaway core module with an uncovered branch makes `npm run coverage` exit non-zero. Delete the module once this has been seen red.
- `importing vscode from a core test fails fast`: Vitest aliases `vscode` to a module that throws, so core can't depend on it even at runtime

## Implementation tasks
- [ ] Add `vitest` and `@vitest/coverage-v8`
- [ ] `vitest.config.ts`: `include: ["test/unit/**/*.test.ts", "test/fakes/**/*.test.ts"]`, `coverage.include: ["src/core/**"]`, `thresholds: { lines: 90, branches: 90 }`, alias `vscode` to `test/unit/no-vscode.ts`
- [ ] Scripts: `test:unit`, `test:unit:watch`, `coverage`
- [ ] Port the #01 fixture checks into `test/unit/tooling.test.ts`

## Acceptance criteria
- [ ] The listed tests pass
- [ ] `npm run coverage` prints a coverage table for core and enforces the threshold
- [ ] The threshold failure has been seen locally once. CI comes in #06.

## Depends on
#01

## Labels
`infra`, `test`

## Estimate
S
