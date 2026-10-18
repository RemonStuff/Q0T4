# 33: Wire subjects end to end

**Iteration:** 4 (Subjects)

## Description
Connect subject resolution, per-subject limits from settings, same-subject history and classifier charging through the participant. Reload the config on change. Show `parseConfig` warnings once per change through `UiPort.showInfo`.

## Tests to write first
*(integration, fake provider)*
- `a react prompt is charged to frontend via keyword`
- `a follow-up prompt without keywords stays on the thread subject`
- `/use backend switches the thread subject`
- `a prompt with no keyword is classified by the fake model's scripted answer and charged classifier tokens`
- `exhausting frontend refuses frontend prompts but backend still works`
- `changing q0t4.subjects at runtime takes effect on the next request`

## Implementation tasks
- [ ] Update the composition root, wiring `ConfigPort` into the handler and `BudgetStore`
- [ ] A `vscodeUi.showInfo` minimal adapter (expanded in #36)
- [ ] Update `docs/manual-testing.md`

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green with a `.vsix` artifact
- [ ] Manual: set `frontend.weeklyLimit` to 2000, ask a few React questions until refused, then ask an SQL question and see it answered under `backend`

## Depends on
#31, #32

## Labels
`feature`

## Estimate
M
