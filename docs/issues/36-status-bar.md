# 36: Status bar item

**Iteration:** 5 (Visibility)

## Description
A status bar item shows the current repo's subject (or the last-used subject when no folder is open) and its usage, e.g. `$(pulse) RemonStuff/Q0T4 112k/150k`, with a ⚠️ or ⛔ state. Clicking it runs "Q0T4: Show Usage" (#37). The text and state are computed in pure core. The `vscodeUi` adapter just renders them. The item refreshes after each request, on config change, at the weekly reset (a timer set from `msUntilReset`) and on activation.

## Tests to write first
- `shows the current repo subject with used/limit`
- `updates when the active editor moves to another workspace folder`
- `shows the last-used subject when no folder is open`
- `shows the fallback subject with 0 when nothing was used yet`
- `state is warning at or above warnAtPercent`
- `state is error when exhausted`
- `tooltip lists all subjects' usage and the reset date`
- `refresh is triggered after a request completes, including refusals`
- `refresh is triggered on config change`
- `a reset timer fires at the next reset and shows zero usage` (FixedClock + fake timer)
- `the last subject is persisted under q0t4.ui.lastSubject`
- *(integration)* `status bar item is created and shows text after activation`

## Implementation tasks
- [ ] `src/core/format/statusBarText.ts` and `src/core/statusBar.ts` (controller)
- [ ] `UiPort.setStatusBar(state)` and the `vscodeUi` adapter (`window.createStatusBarItem`, `ThemeColor` for warning/error)
- [ ] Timer scheduling through an injected `setTimeout` so it can be tested

## Acceptance criteria
- [ ] The listed tests pass, core coverage holds, and CI is green
- [ ] Manual: the status bar updates right after a chat and turns yellow past 80%

## Depends on
#33

## Labels
`feature`

## Estimate
M
