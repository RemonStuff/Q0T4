# 26: Settings schema, `parseConfig` and the config adapter

**Iteration:** 4 (Repo subjects)

## Description
Make budgets configurable under `q0t4.*` ([PLAN §3](../PLAN.md#3-settings-q0t4)). Subjects are repos (`owner/repo`) plus `general` for chats with no folder open. Every repo automatically gets `defaultLimit` (renamed from `defaultWeeklyLimit`; nothing has shipped, so there's no migration). `q0t4.subjects` only *overrides* limits, for specific repos or names. Amounts are in the active budget unit, which is always tokens until `budgetUnit` arrives in #53.

This issue covers the settings for the **no-pool** configuration. Price settings come in #51, and pool, reserve and cycle settings in #56.

The package.json `contributes.configuration` declares the schema and defaults. Pure `parseConfig` validates the raw values and **never throws**: broken entries fall back to the defaults and produce a list of warnings, shown once per change. It also provides `weeklyLimitFor(subject)`. The `vscodeConfig` adapter implements `ConfigPort`, including change events.

## Tests to write first
- `returns the default config when nothing is set`: `subjects = { general: 200k }`, `defaultLimit = 150k`, `fallbackSubject = "general"`
- `weeklyLimitFor returns the configured limit for a listed repo`
- `weeklyLimitFor matches repo keys case-insensitively ("remonstuff/q0t4" = "RemonStuff/Q0T4")`
- `weeklyLimitFor returns defaultLimit for an unlisted repo`
- `trims subject keys and keeps their original casing for display`
- `rejects a negative or non-numeric weeklyLimit, warns and uses defaultLimit`
- `accepts weeklyLimit 0 (subject disabled)`
- `rejects a negative defaultLimit and uses 150k`
- `warns when two keys differ only by case and keeps the first`
- `clamps warnAtPercent and dailyPaceWarning to 1–100`
- `rejects an unknown resetDay and uses monday`
- `includeHistory defaults to true`
- *(integration)* `vscodeConfig reads q0t4.* and fires onDidChange on update`
- *(integration)* `package.json configuration defaults match core defaults`

## Implementation tasks
- [ ] `contributes.configuration`: `subjects`, `defaultLimit`, `fallbackSubject`, `resetDay`, `warnAtPercent`, `dailyPaceWarning`, `includeHistory`, with descriptions and an example of an `owner/repo` key
- [ ] `src/core/subjects/parseConfig.ts` with `weeklyLimitFor`
- [ ] `src/adapters/vscodeConfig.ts`
- [ ] Replace `DEFAULT_SUBJECTS` usage in the handler with `ConfigPort`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green
- [ ] Manual: the Settings UI shows the Q0T4 section with defaults

## Depends on
#25

## Labels
`feature`

## Estimate
M
