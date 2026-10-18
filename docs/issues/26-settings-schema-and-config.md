# 26: Settings schema, `parseSubjects` and the config adapter

**Iteration:** 4 (Subjects)

## Description
Make subjects and budget settings configurable under `q0t4.*` ([PLAN §3](../PLAN.md#3-settings-q0t4)). The package.json `contributes.configuration` declares the schema and defaults. Pure `parseConfig` validates the raw values and **never throws**: broken entries fall back to the defaults and produce a list of warnings, shown once per change. The `vscodeConfig` adapter implements `ConfigPort`, including change events.

## Tests to write first
- `returns the default subjects when the setting is unset`
- `default subjects are general 200k, frontend 150k and backend 150k with the spec keywords`
- `lower-cases and trims subject names`
- `rejects a negative or non-numeric weeklyLimit and warns`
- `accepts weeklyLimit 0 (subject disabled)`
- `normalises keywords: trims, lower-cases, removes duplicates and empties`
- `warns and uses the first subject when fallbackSubject is not defined`
- `clamps warnAtPercent and dailyPaceWarning to 1–100`
- `rejects an unknown resetDay and uses monday`
- `includeHistory defaults to true`
- *(integration)* `vscodeConfig reads q0t4.* and fires onDidChange on update`
- *(integration)* `package.json configuration defaults match core DEFAULT_SUBJECTS`

## Implementation tasks
- [ ] `contributes.configuration` with descriptions (including the premium-request note on `classifierModelFamily`)
- [ ] `src/core/subjects/parseConfig.ts`
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
