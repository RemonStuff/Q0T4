# 26: Settings schema, `parseConfig` and the config adapter

**Iteration:** 4 (Repo subjects)

## Description
Make budgets configurable under `q0t4.*` ([PLAN §3](../PLAN.md#3-settings-q0t4)). Subjects are repos (`owner/repo`) plus `general` for chats with no folder open. Every repo automatically gets `defaultWeeklyLimit`. `q0t4.subjects` only *overrides* limits, for specific repos or names.

The package.json `contributes.configuration` declares the schema and defaults. Pure `parseConfig` validates the raw values and **never throws**: broken entries fall back to the defaults and produce a list of warnings, shown once per change. It also provides `limitFor(subject)`. The `vscodeConfig` adapter implements `ConfigPort`, including change events.

## Tests to write first
- `returns the default config when nothing is set`: `subjects = { general: 200k }`, `defaultWeeklyLimit = 150k`, `fallbackSubject = "general"`
- `limitFor returns the configured limit for a listed repo`
- `limitFor matches repo keys case-insensitively ("remonstuff/q0t4" = "RemonStuff/Q0T4")`
- `limitFor returns defaultWeeklyLimit for an unlisted repo`
- `trims subject keys and keeps their original casing for display`
- `rejects a negative or non-numeric weeklyLimit, warns and uses defaultWeeklyLimit`
- `accepts weeklyLimit 0 (subject disabled)`
- `rejects a negative defaultWeeklyLimit and uses 150k`
- `warns when two keys differ only by case and keeps the first`
- `clamps warnAtPercent and dailyPaceWarning to 1–100`
- `rejects an unknown resetDay and uses monday`
- `includeHistory defaults to true`
- *(integration)* `vscodeConfig reads q0t4.* and fires onDidChange on update`
- *(integration)* `package.json configuration defaults match core defaults`

## Implementation tasks
- [ ] `contributes.configuration`: `subjects`, `defaultWeeklyLimit`, `fallbackSubject`, `resetDay`, `warnAtPercent`, `dailyPaceWarning`, `includeHistory`, with descriptions and an example of an `owner/repo` key
- [ ] `src/core/subjects/parseConfig.ts` with `limitFor`
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
