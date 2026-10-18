# 01: Project scaffold

**Iteration:** 0 (Test harness)

## Description
Create the empty extension project so every later issue has a place to land. This covers TypeScript in strict mode, esbuild bundling to `dist/extension.js`, ESLint and Prettier, and the `src/core`, `src/ports`, `src/adapters` and `test/` layout from [PLAN §2](../PLAN.md#2-architecture). The most important rule is mechanical: **`src/core` must never import `vscode`**, enforced by ESLint so the ports-and-adapters boundary can't wear away.

## Tests to write first
- `lint fails when a file in src/core imports vscode`: a fixture file under `test/lint-fixtures/core/` is linted with the project config and the test expects a `no-restricted-imports` error
- `lint passes when a file in src/adapters imports vscode`
- `typecheck rejects implicit any`: a fixture checked with `tsc --noEmit -p test/lint-fixtures`

## Implementation tasks
- [ ] `package.json`: name `q0t4`, displayName `Q0T4`, publisher placeholder, `engines.vscode` pinned (open question 9), `main: dist/extension.js`, **no runtime dependencies**
- [ ] Dev dependencies: `typescript`, `@types/vscode` (same minor version as `engines`), `@types/node`, `esbuild`, `eslint`, `typescript-eslint`, `prettier`
- [ ] `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, target ES2022, module node16
- [ ] `esbuild.mjs` bundles `src/extension.ts`, with `vscode` as an external
- [ ] `eslint.config.mjs` with `no-restricted-imports: ["vscode"]` scoped to `src/core/**`
- [ ] Scripts: `build`, `watch`, `lint`, `typecheck`, `format`
- [ ] Empty `src/extension.ts` exporting `activate`/`deactivate`
- [ ] `.gitignore`, `.vscodeignore`, `.editorconfig`, `.vscode/launch.json` (Run Extension)

## Acceptance criteria
- [ ] The listed tests pass. They can run as plain node scripts until Vitest lands in #02.
- [ ] `npm run lint`, `npm run typecheck` and `npm run build` succeed on a clean clone
- [ ] Manual: F5 opens an Extension Development Host without errors

## Depends on
None

## Labels
`infra`

## Estimate
S
